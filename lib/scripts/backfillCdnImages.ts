/**
 * One-time migration: populate images[] with CDN URLs for listings that have
 * external_id + photos_timestamp but empty images[].
 *
 * Run:
 *   npx ts-node lib/scripts/backfillCdnImages.ts
 *   npx ts-node lib/scripts/backfillCdnImages.ts --dry-run
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const DRY_RUN = process.argv.includes('--dry-run');
const CDN_BASE = 'https://ddfcdn.realtor.ca/listings';

function buildCdnUrls(externalId: string, photosTimestamp: string, photosCount: number): string[] {
  const count = Math.max(photosCount || 1, 1);
  const eid = externalId.toLowerCase();
  const urls: string[] = [];
  for (let i = 1; i <= count; i++) {
    urls.push(`${CDN_BASE}/TS${photosTimestamp}/reb82/highres/4/${eid}_${i}.jpg`);
  }
  return urls;
}

// Cursor-based pagination — avoids slow OFFSET scans on unindexed images column.
// Each page fetches rows where mls_number > cursor, ordered by mls_number ASC.
async function fetchBatch(cursor: string, limit: number): Promise<any[]> {
  const cursorFilter = cursor ? `&mls_number=gt.${encodeURIComponent(cursor)}` : '';
  const url = `${SUPABASE_URL}/rest/v1/mls_listings` +
    `?select=mls_number,external_id,photos_timestamp,photos_count` +
    `&or=(images.is.null,images.eq.%5B%5D)` +
    `&external_id=not.is.null` +
    `&photos_timestamp=not.is.null` +
    cursorFilter +
    `&order=mls_number.asc` +
    `&limit=${limit}`;
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${await res.text()}`);
  return res.json();
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
  if (!res.ok) throw new Error(`PATCH failed: ${res.status} ${await res.text()}`);
}

const CONCURRENCY = 20; // parallel PATCHes per batch

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  if (DRY_RUN) console.log('[backfill-cdn] DRY RUN — no writes');

  console.log('[backfill-cdn] Loading listings with empty images but CDN metadata…');

  const PAGE = 50;
  let cursor = '';
  let total = 0;
  let ok = 0;
  let failed = 0;
  let page = 0;

  while (true) {
    const rows = await fetchBatch(cursor, PAGE);
    if (!rows.length) break;
    page++;
    total += rows.length;
    cursor = rows[rows.length - 1].mls_number; // advance cursor

    if (DRY_RUN) {
      for (const row of rows) {
        const urls = buildCdnUrls(row.external_id, row.photos_timestamp, row.photos_count ?? 1);
        console.log(`  [dry] ${row.mls_number} → ${urls.length} URLs`);
        ok++;
      }
    } else {
      // Patch CONCURRENCY rows at a time in parallel
      for (let i = 0; i < rows.length; i += CONCURRENCY) {
        const chunk = rows.slice(i, i + CONCURRENCY);
        const results = await Promise.allSettled(
          chunk.map(row => {
            const urls = buildCdnUrls(row.external_id, row.photos_timestamp, row.photos_count ?? 1);
            return patchImages(row.mls_number, urls);
          })
        );
        for (let j = 0; j < results.length; j++) {
          if (results[j].status === 'fulfilled') ok++;
          else { console.warn(`  ✗ ${chunk[j].mls_number}: ${(results[j] as any).reason?.message}`); failed++; }
        }
      }
    }

    process.stdout.write(`\r[backfill-cdn] page ${page} | ${ok + failed}/${total} done (ok=${ok} fail=${failed}) cursor=${cursor}…`);
    if (rows.length < PAGE) break;
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\n[backfill-cdn] Done — updated: ${ok} | failed: ${failed}`);
}

main().catch(e => {
  console.error('[backfill-cdn] FATAL:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
