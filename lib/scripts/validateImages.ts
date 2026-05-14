/**
 * Validates listing images by HTTP HEAD-checking the first photo URL.
 * Sets images = NULL for any listing whose first image returns a non-200 status.
 *
 * Run:
 *   npx ts-node lib/scripts/validateImages.ts
 *   npx ts-node lib/scripts/validateImages.ts --dry-run
 */

import * as https from 'https';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const DRY_RUN      = process.argv.includes('--dry-run');
const CONCURRENCY  = 30;
const PAGE_SIZE    = 500;

function httpHead(url: string): Promise<number> {
  return new Promise(resolve => {
    try {
      const u = new URL(url);
      const req = https.request(
        { hostname: u.hostname, path: u.pathname + u.search, method: 'HEAD' },
        res => resolve(res.statusCode ?? 0)
      );
      req.on('error', () => resolve(0));
      req.setTimeout(6000, () => { req.destroy(); resolve(0); });
      req.end();
    } catch { resolve(0); }
  });
}

async function fetchBatch(cursor: string): Promise<any[]> {
  const cursorFilter = cursor ? `&mls_number=gt.${encodeURIComponent(cursor)}` : '';
  const url = `${SUPABASE_URL}/rest/v1/mls_listings` +
    `?select=mls_number,images` +
    `&images=not.is.null` +
    cursorFilter +
    `&order=mls_number.asc` +
    `&limit=${PAGE_SIZE}`;
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Fetch failed ${res.status}: ${await res.text()}`);
  return res.json();
}

async function clearImages(mlsNumber: string): Promise<void> {
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
      body: JSON.stringify({ images: null }),
    }
  );
  if (!res.ok) throw new Error(`PATCH failed ${res.status}`);
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Missing env vars');
  if (DRY_RUN) console.log('[validate] DRY RUN — no writes');

  let cursor      = '';
  let totalChecked = 0;
  let totalBad    = 0;
  let totalGood   = 0;
  let page        = 0;

  while (true) {
    const rows = await fetchBatch(cursor);
    if (!rows.length) break;
    page++;
    cursor = rows[rows.length - 1].mls_number;

    // Filter to rows that have at least one http URL
    const toCheck = rows.filter(r =>
      Array.isArray(r.images) && r.images.length > 0 && String(r.images[0]).startsWith('http')
    );

    // Check CONCURRENCY at a time
    for (let i = 0; i < toCheck.length; i += CONCURRENCY) {
      const chunk = toCheck.slice(i, i + CONCURRENCY);
      const statuses = await Promise.all(chunk.map(r => httpHead(r.images[0])));

      for (let j = 0; j < chunk.length; j++) {
        const row    = chunk[j];
        const status = statuses[j];
        if (status === 200) {
          totalGood++;
        } else {
          totalBad++;
          if (DRY_RUN) {
            process.stdout.write(`\r  [dry] would clear ${row.mls_number} (HTTP ${status})            `);
          } else {
            try {
              await clearImages(row.mls_number);
            } catch (e: any) {
              console.warn(`\n  ✗ ${row.mls_number}: ${e.message}`);
            }
          }
        }
      }
    }

    totalChecked += toCheck.length;
    process.stdout.write(
      `\r[validate] page ${page} | checked=${totalChecked} good=${totalGood} bad=${totalBad}…`
    );

    if (rows.length < PAGE_SIZE) break;
  }

  console.log(`\n[validate] Done — good: ${totalGood} | cleared: ${totalBad}`);
}

main().catch(e => {
  console.error('[validate] FATAL:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
