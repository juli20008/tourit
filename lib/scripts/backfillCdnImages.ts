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

async function fetchBatch(offset: number, limit: number): Promise<any[]> {
  const url = `${SUPABASE_URL}/rest/v1/mls_listings` +
    `?select=mls_number,external_id,photos_timestamp,photos_count` +
    `&or=(images.is.null,images.eq.%5B%5D)` +
    `&external_id=not.is.null` +
    `&photos_timestamp=not.is.null` +
    `&limit=${limit}&offset=${offset}`;
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

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  if (DRY_RUN) console.log('[backfill-cdn] DRY RUN — no writes');

  console.log('[backfill-cdn] Loading listings with empty images but CDN metadata…');

  const PAGE = 1000;
  let offset = 0;
  let total = 0;
  let ok = 0;
  let failed = 0;

  while (true) {
    const rows = await fetchBatch(offset, PAGE);
    if (!rows.length) break;
    total += rows.length;

    for (const row of rows) {
      const urls = buildCdnUrls(row.external_id, row.photos_timestamp, row.photos_count ?? 1);
      if (DRY_RUN) {
        console.log(`  [dry] ${row.mls_number} → ${urls.length} URLs`);
        ok++;
        continue;
      }
      try {
        await patchImages(row.mls_number, urls);
        ok++;
      } catch (e: any) {
        console.warn(`  ✗ ${row.mls_number}: ${e.message}`);
        failed++;
      }
    }

    process.stdout.write(`\r[backfill-cdn] ${ok + failed}/${total} processed…`);
    if (rows.length < PAGE) break;
    offset += PAGE;
  }

  console.log(`\n[backfill-cdn] Done — updated: ${ok} | failed: ${failed}`);
}

main().catch(e => {
  console.error('[backfill-cdn] FATAL:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
