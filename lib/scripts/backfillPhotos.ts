/**
 * Photo backfill: search DDF, then fetch GetObject photos for any listing
 * whose `images` column is still empty in Supabase.
 *
 * Why we search DDF instead of just reading the DB:
 *   GetObject requires the numeric DDF ListingKey.  Older DB rows have the
 *   MLS number stored in `id`, not the ListingKey — so we must re-query DDF
 *   to get the real key before calling GetObject.
 *
 * Run:
 *   npx ts-node lib/scripts/backfillPhotos.ts
 *   npx ts-node lib/scripts/backfillPhotos.ts --from=2026-01-01T00:00:00Z --max=2000
 */

import dotenv from 'dotenv';
import { getAutoLogoutClient } from 'rets-client';
import { DdfPhotoSession } from '../services/ddfPhotoFetcher';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// CLI args
function getArg(name: string): string | null {
  const a = process.argv.find(x => x.startsWith(`--${name}=`));
  return a ? a.split('=').slice(1).join('=') : null;
}

const FROM_DATE = getArg('from') ?? '2026-01-01T00:00:00Z';
const MAX_LISTINGS = parseInt(getArg('max') ?? '2000', 10);
const PAGE_SIZE = 100;
const MAX_PAGES = 200;
const DELAY_MS = 200;

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ─── Supabase helpers ──────────────────────────────────────────────────────────

async function fetchExistingImageState(mlsNumbers: string[]): Promise<Set<string>> {
  if (!mlsNumbers.length) return new Set();
  const list = mlsNumbers.map(n => `"${n}"`).join(',');
  const ep = `${SUPABASE_URL}/rest/v1/mls_listings?select=mls_number,images&mls_number=in.(${list})`;
  const res = await fetch(ep, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Accept: 'application/json' },
  });
  if (!res.ok) return new Set();
  const rows: any[] = await res.json();
  // Return MLS numbers that already have at least one image
  const hasImages = new Set<string>();
  for (const r of rows) {
    const imgs = r.images;
    if (Array.isArray(imgs) ? imgs.length > 0 : Boolean(imgs)) {
      hasImages.add(r.mls_number);
    }
  }
  return hasImages;
}

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

  console.log(`[backfill] FROM: ${FROM_DATE}  MAX: ${MAX_LISTINGS} listings`);

  let totalProcessed = 0;
  let totalOk = 0;
  let totalZero = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  await (getAutoLogoutClient as any)(
    { loginUrl, username, password, version: 'RETS/1.7.2', userAgent: 'Tourit-Backfill/1.0' },
    async (rets: any) => {
      // One photo session for the whole run
      const photoSession = new DdfPhotoSession(loginUrl, username, password);
      await photoSession.login();

      let offset = 1;
      let page = 0;

      while (page < MAX_PAGES && totalProcessed < MAX_LISTINGS) {
        page++;
        const query = `(LastUpdated=${FROM_DATE})`;
        console.log(`\n[backfill] Page ${page} (offset=${offset}, processed so far: ${totalProcessed})…`);

        let pageItems: any[];
        try {
          const result = await rets.search.query(
            'Property', 'Property',
            query,
            { limit: PAGE_SIZE, offset, count: 1, format: 'COMPACT', standardNames: 1 } as any
          );
          pageItems = result.results ?? [];
          console.log(`[backfill] DDF returned ${pageItems.length} item(s) on page ${page} (total: ${result.count ?? '?'})`);
          if (pageItems.length === 0) break;
        } catch (e: any) {
          console.error(`[backfill] DDF search failed on page ${page}: ${e.message}`);
          break;
        }

        // Build map: mlsNumber → ddfListingKey
        const candidates = new Map<string, string | number>(); // mls → ddfKey
        for (const item of pageItems) {
          const ddfKey = item.ListingKey ?? item.ListingID ?? item.id;
          const mls = String(
            item.MlsNumber ?? item.ListingId ?? item.ListingID ?? item.MLS_NUM ?? item.ListingKey ?? ''
          );
          if (mls && ddfKey) candidates.set(mls, ddfKey);
        }

        // Check Supabase for which of these already have images
        const mlsList = Array.from(candidates.keys());
        const alreadyHasImages = await fetchExistingImageState(mlsList);

        const toFetch = mlsList.filter(mls => !alreadyHasImages.has(mls));
        totalSkipped += mlsList.length - toFetch.length;
        console.log(`[backfill] ${toFetch.length} need photos (${mlsList.length - toFetch.length} already have them)`);

        for (const mls of toFetch) {
          if (totalProcessed >= MAX_LISTINGS) break;
          totalProcessed++;

          const ddfKey = candidates.get(mls)!;
          try {
            const urls = await photoSession.fetchPhotoUrls(ddfKey);
            if (urls.length > 0) {
              await patchImages(mls, urls);
              console.log(`[backfill] ${mls} (key=${ddfKey}): ${urls.length} photo(s) saved`);
              totalOk++;
            } else {
              console.log(`[backfill] ${mls}: 0 URLs returned`);
              totalZero++;
            }
          } catch (e: any) {
            console.warn(`[backfill] ${mls} (key=${ddfKey}): ${e.message}`);
            totalFailed++;
          }

          await sleep(DELAY_MS);
        }

        if (pageItems.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
        await sleep(1000);
      }
    }
  );

  console.log(`\n[backfill] === DONE ===`);
  console.log(`  Photos fetched: ${totalOk}`);
  console.log(`  Zero URLs:      ${totalZero}`);
  console.log(`  Errors:         ${totalFailed}`);
  console.log(`  Already had photos (skipped): ${totalSkipped}`);
  console.log(`  Total DDF listings seen: ${totalProcessed + totalSkipped}`);
}

main().catch(err => {
  console.error('[backfill] FATAL:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
