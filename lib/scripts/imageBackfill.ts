/**
 * Image backfill: fetch DDF photos for every listing where images = [] in Supabase.
 *
 * Strategy (avoids scanning 200k DDF pages unnecessarily):
 *  1. Load all mls_numbers with empty images from Supabase into a Set upfront.
 *  2. Iterate DDF Search pages; for each listing whose MLS is in the Set,
 *     call GetObject using the numeric ListingKey (MLS numbers cause RETS 20402).
 *  3. PATCH images[] in Supabase, remove from the Set.
 *  4. Stop early once the Set is empty.
 *
 * Run:
 *   npx ts-node lib/scripts/imageBackfill.ts
 *   npx ts-node lib/scripts/imageBackfill.ts --max=1000 --delay-ms=2000
 */

import dotenv from 'dotenv';
import { getAutoLogoutClient } from 'rets-client';
import { DdfPhotoSession } from '../services/ddfPhotoFetcher';
import { getPool, patchImages as patchImagesDb } from '../db';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

function getArg(name: string): string | null {
  const a = process.argv.find(x => x.startsWith(`--${name}=`));
  return a ? a.split('=').slice(1).join('=') : null;
}

const MAX        = parseInt(getArg('max') ?? '5000', 10);
const DELAY_MS   = parseInt(getArg('delay-ms') ?? '800', 10);
const PAGE_SIZE  = 100;
const PAGE_DELAY = 500;
const CITIES_ARG = getArg('cities');
const CITY_FILTER: string[] = CITIES_ARG
  ? CITIES_ARG.split(',').map(c => c.trim()).filter(Boolean)
  : [];
// --mls=N12835542,C9999999  → only backfill these specific listings
const MLS_ARG = getArg('mls');
const MLS_FILTER: Set<string> = MLS_ARG
  ? new Set(MLS_ARG.split(',').map(s => s.trim()).filter(Boolean))
  : new Set();

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function filterNeedsPhotos(mlsNumbers: string[]): Promise<Set<string>> {
  if (!mlsNumbers.length) return new Set();
  const pool = getPool();
  const params: any[] = [...mlsNumbers];
  const mlsPh = mlsNumbers.map((_, i) => `$${i + 1}`).join(', ');
  let query = `SELECT mls_number, images FROM mls_listings WHERE mls_number IN (${mlsPh})`;

  if (CITY_FILTER.length) {
    const cityPh = CITY_FILTER.map((_, i) => `$${mlsNumbers.length + i + 1}`).join(', ');
    query += ` AND city IN (${cityPh})`;
    params.push(...CITY_FILTER);
  }

  const res = await pool.query(query, params);
  const needs = new Set<string>();
  for (const r of res.rows) {
    if (!r.mls_number) continue;
    const imgs = r.images;
    if (!imgs || (Array.isArray(imgs) && imgs.length === 0)) needs.add(String(r.mls_number));
  }
  return needs;
}

async function loadMlsFilter(): Promise<Set<string>> {
  if (!MLS_FILTER.size) return new Set();
  const pool = getPool();
  const ph = [...MLS_FILTER].map((_, i) => `$${i + 1}`).join(', ');
  const res = await pool.query(
    `SELECT mls_number FROM mls_listings WHERE mls_number IN (${ph})`,
    [...MLS_FILTER]
  );
  const set = new Set<string>();
  for (const r of res.rows) if (r.mls_number) set.add(String(r.mls_number));
  return set;
}

async function fetchDirectByMls(
  mlsNumbers: string[],
  photoSession: DdfPhotoSession
): Promise<{ ok: number; zero: number; failed: number }> {
  const pool = getPool();
  const ph = mlsNumbers.map((_, i) => `$${i + 1}`).join(', ');
  const res = await pool.query(
    `SELECT mls_number, id FROM mls_listings WHERE mls_number IN (${ph})`,
    mlsNumbers
  );
  const rows: any[] = res.rows;

  let ok = 0, zero = 0, failed = 0;

  for (const row of rows) {
    const mls        = String(row.mls_number ?? '');
    const listingKey = row.id;

    if (!mls) { failed++; continue; }

    if (!listingKey || !/^\d+$/.test(String(listingKey))) {
      console.warn(`  ${mls}: id "${listingKey}" is not a numeric DDF ListingKey — use full DDF scan instead`);
      zero++;
      continue;
    }

    await sleep(DELAY_MS);
    try {
      const urls = await photoSession.fetchPhotoUrls(listingKey);
      if (urls.length > 0) {
        await patchImagesDb(mls, urls);
        console.log(`  ✓ ${mls} (key=${listingKey}): ${urls.length} photo(s)`);
        ok++;
      } else {
        console.log(`  ○ ${mls} (key=${listingKey}): 0 URLs returned`);
        zero++;
      }
    } catch (e: any) {
      console.warn(`  ✗ ${mls} (key=${listingKey}): ${e.message}`);
      failed++;
    }
  }

  return { ok, zero, failed };
}


// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const loginUrl = process.env.DDF_LOGIN_URL!;
  const username  = process.env.DDF_USERNAME!;
  const password  = process.env.DDF_PASSWORD!;

  if (!loginUrl || !username || !password || !process.env.DATABASE_URL) {
    throw new Error('Missing required env vars (DDF_LOGIN_URL, DDF_USERNAME, DDF_PASSWORD, DATABASE_URL)');
  }

  if (CITY_FILTER.length) console.log(`[image-backfill] City filter: ${CITY_FILTER.join(', ')}`);

  let totalOk = 0, totalZero = 0, totalFailed = 0, totalProcessed = 0;

  // ── Fast path: --mls given → look up DDF ListingKey (id) from Supabase and
  //    call GetObject directly without scanning 200k DDF pages.
  if (MLS_FILTER.size) {
    console.log(`[image-backfill] MLS filter: ${[...MLS_FILTER].join(', ')}`);
    const targets = await loadMlsFilter();
    if (!targets.size) { console.log('[image-backfill] None of those MLS numbers found in Supabase.'); return; }

    const photoSession = new DdfPhotoSession(loginUrl, username, password);
    await photoSession.login();
    const result = await fetchDirectByMls([...targets], photoSession);
    totalOk    = result.ok;
    totalZero  = result.zero;
    totalFailed = result.failed;

    console.log(`\n[image-backfill] === DONE (direct mode) ===`);
    console.log(`  Photos saved:   ${totalOk}`);
    console.log(`  Zero URLs:      ${totalZero}`);
    console.log(`  Errors:         ${totalFailed}`);
    return;
  }

  // ── Full DDF scan: check images status per-batch (avoids bulk Supabase query timeout) ──
  console.log(`[image-backfill] Starting DDF scan (checking images per page)  max=${MAX}  delay=${DELAY_MS}ms`);

  await (getAutoLogoutClient as any)(
    { loginUrl, username, password, version: 'RETS/1.7.2', userAgent: 'Tourit-ImageBackfill/1.0' },
    async (rets: any) => {
      const photoSession = new DdfPhotoSession(loginUrl, username, password);
      await photoSession.login();

      let offset = 1;

      for (let page = 1; ; page++) {
        if (totalProcessed >= MAX) {
          console.log(`[image-backfill] Reached max=${MAX}, stopping.`);
          break;
        }

        let items: any[];
        try {
          const result = await rets.search.query(
            'Property', 'Property',
            '(LastUpdated=2023-01-01T00:00:00Z)',
            { limit: PAGE_SIZE, offset, count: page === 1 ? 1 : 0, format: 'COMPACT', standardNames: 1 } as any
          );
          items = result.results ?? [];
          if (page === 1) console.log(`[image-backfill] DDF total listings: ${result.count ?? '?'}`);
          if (!items.length) { console.log('[image-backfill] No more DDF results.'); break; }
        } catch (e: any) {
          console.error(`[image-backfill] DDF search failed on page ${page}: ${e.message}`);
          break;
        }

        // Extract MLS numbers from this DDF page, then ask Supabase which ones need photos
        const pageMls = items.map(item => String(
          item.ListingId ?? item.ListingID ?? item.MLS_NUM ?? item.MlsNumber ?? item.ListingKey ?? ''
        )).filter(Boolean);

        const needsPhotos = await filterNeedsPhotos(pageMls);

        if (needsPhotos.size > 0) {
          console.log(`[image-backfill] page ${page} | ${needsPhotos.size}/${items.length} need photos | ok=${totalOk}`);
        }

        for (const item of items) {
          if (totalProcessed >= MAX) break;

          const mls = String(
            item.ListingId ?? item.ListingID ?? item.MLS_NUM ?? item.MlsNumber ?? item.ListingKey ?? ''
          );
          if (!mls || !needsPhotos.has(mls)) continue;

          const ddfKey = item.ListingKey ?? item.ListingID ?? item.id ?? mls;
          if (!ddfKey) {
            console.warn(`  ${mls}: no ListingKey available, skipping`);
            continue;
          }

          totalProcessed++;
          await sleep(DELAY_MS);

          try {
            const urls = await photoSession.fetchPhotoUrls(ddfKey);
            if (urls.length > 0) {
              await patchImagesDb(mls, urls);
              console.log(`  ✓ ${mls} (key=${ddfKey}): ${urls.length} photo(s)`);
              totalOk++;
            } else {
              console.log(`  ○ ${mls}: 0 URLs returned`);
              totalZero++;
            }
          } catch (e: any) {
            console.warn(`  ✗ ${mls} (key=${ddfKey}): ${e.message}`);
            totalFailed++;
          }
        }

        if (items.length < PAGE_SIZE) { console.log('[image-backfill] Last DDF page reached.'); break; }
        offset += PAGE_SIZE;
        await sleep(PAGE_DELAY);
      }
    }
  );

  console.log(`\n[image-backfill] === DONE ===`);
  console.log(`  Photos saved:   ${totalOk}`);
  console.log(`  Zero URLs:      ${totalZero}`);
  console.log(`  Errors:         ${totalFailed}`);
  console.log(`  Processed:      ${totalProcessed}`);
}

main().catch(e => {
  console.error('[image-backfill] FATAL:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
