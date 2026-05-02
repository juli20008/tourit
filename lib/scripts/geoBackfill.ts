/**
 * Geo backfill: update lat/lng for all listings using real DDF coordinates.
 *
 * No GetObject calls — just Search → extract Latitude/Longitude → PATCH.
 * Much faster than the full sync; safe to re-run (only touches lat/lng).
 *
 * Run:
 *   npx ts-node lib/scripts/geoBackfill.ts
 *   npx ts-node lib/scripts/geoBackfill.ts --from=2024-01-01T00:00:00Z --max-pages=500
 */

import dotenv from 'dotenv';
import { getAutoLogoutClient } from 'rets-client';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getArg(name: string): string | null {
  const a = process.argv.find(x => x.startsWith(`--${name}=`));
  return a ? a.split('=').slice(1).join('=') : null;
}

const FROM_DATE  = getArg('from') ?? '2000-01-01T00:00:00Z';
const PAGE_SIZE  = 100;
const PAGE_DELAY = 500; // ms between pages — no per-listing delay needed

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function toNumber(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

async function batchPatchGeo(rows: Array<{ mls_number: string; lat: number | null; lng: number | null }>) {
  // Filter to rows that actually have real DDF coordinates
  const valid = rows.filter(r => r.lat !== null && r.lng !== null && r.lat !== 0 && r.lng !== 0);
  if (!valid.length) return 0;

  // PATCH each row individually — PostgREST doesn't support bulk PATCH by different PKs
  let ok = 0;
  for (const r of valid) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/mls_listings?mls_number=eq.${encodeURIComponent(r.mls_number)}`,
      {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ lat: r.lat, lng: r.lng }),
      }
    );
    if (res.ok) ok++;
    else console.warn(`PATCH failed for ${r.mls_number}: ${res.status}`);
  }
  return ok;
}

async function main() {
  const loginUrl = process.env.DDF_LOGIN_URL!;
  const username  = process.env.DDF_USERNAME!;
  const password  = process.env.DDF_PASSWORD!;

  if (!loginUrl || !username || !password || !SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Missing required env vars');
  }

  console.log(`[geo] FROM: ${FROM_DATE}  (no page cap — runs until DDF exhausted)`);

  let totalSeen  = 0;
  let totalPatch = 0;

  await (getAutoLogoutClient as any)(
    { loginUrl, username, password, version: 'RETS/1.7.2', userAgent: 'Tourit-GeoBackfill/1.0' },
    async (rets: any) => {
      let offset = 1;

      for (let page = 1; ; page++) {
        console.log(`[geo] Page ${page} (offset=${offset}, patched so far: ${totalPatch})…`);

        let items: any[];
        try {
          const result = await rets.search.query(
            'Property', 'Property',
            `(LastUpdated=${FROM_DATE})`,
            { limit: PAGE_SIZE, offset, count: 1, format: 'COMPACT', standardNames: 1 } as any
          );
          items = result.results ?? [];
          if (page === 1) console.log(`[geo] Total DDF listings in range: ${result.count ?? '?'}`);
          if (!items.length) { console.log('[geo] No more results.'); break; }
        } catch (e: any) {
          console.error(`[geo] DDF search failed on page ${page}: ${e.message}`);
          break;
        }

        const rows = items.map((item: any) => {
          const mls = String(
            item.ListingId ?? item.ListingID ?? item.MLS_NUM ?? item.MlsNumber ?? item.ListingKey ?? ''
          );
          const lat = toNumber(item.Latitude);
          const lng = toNumber(item.Longitude);
          return { mls_number: mls, lat, lng };
        }).filter(r => r.mls_number);

        totalSeen += rows.length;
        const patched = await batchPatchGeo(rows);
        totalPatch += patched;

        const withCoords = rows.filter(r => r.lat !== null && r.lat !== 0).length;
        console.log(`[geo] Page ${page}: ${rows.length} listings, ${withCoords} have DDF coords, ${patched} patched`);

        if (items.length < PAGE_SIZE) { console.log('[geo] Last page reached.'); break; }

        offset += PAGE_SIZE;
        await sleep(PAGE_DELAY);
      }
    }
  );

  console.log(`\n[geo] === DONE ===`);
  console.log(`  Listings seen:   ${totalSeen}`);
  console.log(`  Geo rows patched: ${totalPatch}`);
}

main().catch(e => {
  console.error('[geo] FATAL:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
