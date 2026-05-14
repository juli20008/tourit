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

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

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

// ─── Supabase: load all MLS numbers that need photos ─────────────────────────

async function loadNeedsPhotos(): Promise<Set<string>> {
  const set = new Set<string>();
  let offset = 0;
  const limit = 1000;

  const cityParam = CITY_FILTER.length
    ? `&city=in.(${CITY_FILTER.map(c => encodeURIComponent(c)).join(',')})` : '';
  if (CITY_FILTER.length) console.log(`[image-backfill] City filter: ${CITY_FILTER.join(', ')}`);

  // When --mls is given, only fetch those specific listings (ignores the
  // images=[] condition — useful for fixing known-broken listings).
  if (MLS_FILTER.size) {
    console.log(`[image-backfill] MLS filter: ${[...MLS_FILTER].join(', ')}`);
    const mlsList = [...MLS_FILTER].map(m => `"${m}"`).join(',');
    const url2 = `${SUPABASE_URL}/rest/v1/mls_listings?select=mls_number&mls_number=in.(${mlsList})`;
    const res2 = await fetch(url2, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Accept: 'application/json' },
    });
    if (res2.ok) {
      const rows2: any[] = await res2.json();
      for (const r of rows2) if (r.mls_number) set.add(String(r.mls_number));
    }
    return set;
  }

  while (true) {
    const url = `${SUPABASE_URL}/rest/v1/mls_listings` +
      `?select=mls_number` +
      `&or=(images.is.null,images.eq.%5B%5D)` +
      cityParam +
      `&limit=${limit}&offset=${offset}`;
    const res = await fetch(url, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Supabase fetch failed: ${res.status}`);
    const rows: any[] = await res.json();
    for (const r of rows) if (r.mls_number) set.add(String(r.mls_number));
    if (rows.length < limit) break;
    offset += limit;
  }
  return set;
}

// ─── Direct fetch: look up DDF GetObject using Supabase id (numeric ListingKey) ──
// Used when --mls is specified — avoids scanning 200k DDF pages.
// Only works when Supabase id is a numeric DDF ListingKey (non-TREB boards).
// TREB listings (N/C/W/E/S/X prefix) have alphanumeric MLS numbers as id
// and require the full DDF scan path.

async function fetchDirectByMls(
  mlsNumbers: string[],
  photoSession: DdfPhotoSession
): Promise<{ ok: number; zero: number; failed: number }> {
  const mlsList = mlsNumbers.map(m => `"${m}"`).join(',');
  const url = `${SUPABASE_URL}/rest/v1/mls_listings` +
    `?select=mls_number,id` +
    `&mls_number=in.(${mlsList})`;
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Supabase lookup failed: ${res.status}`);
  const rows: any[] = await res.json();

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
        await patchImages(mls, urls);
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

// ─── Supabase: patch images ───────────────────────────────────────────────────

async function patchImages(mlsNumber: string, urls: string[]): Promise<void> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/mls_listings?mls_number=eq.${encodeURIComponent(mlsNumber)}`,
    {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ images: urls }),
    }
  );
  if (!res.ok) throw new Error(`PATCH images ${res.status}: ${await res.text()}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const loginUrl = process.env.DDF_LOGIN_URL!;
  const username  = process.env.DDF_USERNAME!;
  const password  = process.env.DDF_PASSWORD!;

  if (!loginUrl || !username || !password || !SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Missing required env vars');
  }

  console.log(`[image-backfill] Loading listings with empty images from Supabase…`);
  const needsPhotos = await loadNeedsPhotos();
  console.log(`[image-backfill] ${needsPhotos.size} listings need photos  |  max=${MAX}  delay=${DELAY_MS}ms`);

  if (!needsPhotos.size) {
    console.log('[image-backfill] Nothing to do.');
    return;
  }

  let totalOk = 0, totalZero = 0, totalFailed = 0, totalProcessed = 0;

  // ── Fast path: --mls given → look up DDF ListingKey (id) from Supabase and
  //    call GetObject directly without scanning 200k DDF pages.
  if (MLS_FILTER.size) {
    const photoSession = new DdfPhotoSession(loginUrl, username, password);
    await photoSession.login();
    const result = await fetchDirectByMls([...needsPhotos], photoSession);
    totalOk    = result.ok;
    totalZero  = result.zero;
    totalFailed = result.failed;

    console.log(`\n[image-backfill] === DONE (direct mode) ===`);
    console.log(`  Photos saved:   ${totalOk}`);
    console.log(`  Zero URLs:      ${totalZero}`);
    console.log(`  Errors:         ${totalFailed}`);
    return;
  }

  await (getAutoLogoutClient as any)(
    { loginUrl, username, password, version: 'RETS/1.7.2', userAgent: 'Tourit-ImageBackfill/1.0' },
    async (rets: any) => {
      const photoSession = new DdfPhotoSession(loginUrl, username, password);
      await photoSession.login();

      let offset = 1;

      for (let page = 1; ; page++) {
        // Stop if we've hit the max or processed everything
        if (totalProcessed >= MAX) {
          console.log(`[image-backfill] Reached max=${MAX}, stopping.`);
          break;
        }
        if (needsPhotos.size === 0) {
          console.log('[image-backfill] All listings processed, stopping early.');
          break;
        }

        console.log(`[image-backfill] DDF page ${page} (offset=${offset} | remaining=${needsPhotos.size} | ok=${totalOk})…`);

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

        for (const item of items) {
          if (totalProcessed >= MAX) break;

          const mls = String(
            item.ListingId ?? item.ListingID ?? item.MLS_NUM ?? item.MlsNumber ?? item.ListingKey ?? ''
          );
          if (!mls || !needsPhotos.has(mls)) continue;

          // Prefer numeric ListingKey; fall back to MLS number for TREB listings that omit it
          const ddfKey = item.ListingKey ?? item.ListingID ?? item.id ?? mls;
          if (!ddfKey) {
            console.warn(`  ${mls}: no ListingKey available, skipping`);
            needsPhotos.delete(mls);
            continue;
          }

          totalProcessed++;
          await sleep(DELAY_MS);

          try {
            const urls = await photoSession.fetchPhotoUrls(ddfKey);
            if (urls.length > 0) {
              await patchImages(mls, urls);
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

          needsPhotos.delete(mls);
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
  console.log(`  Still pending:  ${needsPhotos.size}`);
}

main().catch(e => {
  console.error('[image-backfill] FATAL:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
