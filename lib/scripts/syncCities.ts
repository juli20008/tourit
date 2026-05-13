/**
 * City-targeted sync: pulls all active listings for specific cities from DDF
 * and upserts them into mls_listings. Queries each city separately (the DDF
 * server rejects multi-value City queries). Safe to run alongside existing
 * data — upsert on mls_number never touches rows from other cities.
 *
 * Usage:
 *   npx ts-node lib/scripts/syncCities.ts
 *   npx ts-node lib/scripts/syncCities.ts --dry-run       (count only, no writes)
 *   npx ts-node lib/scripts/syncCities.ts --no-photos     (skip photo fetch)
 *   npx ts-node lib/scripts/syncCities.ts --cities="Vaughan,Aurora"
 *
 * Default cities: Richmond Hill, Markham
 */

import dotenv from 'dotenv';
import { getAutoLogoutClient } from 'rets-client';
import { mapDDFToSupabase } from '../adapters/ListingAdapter';
import { DdfPhotoSession } from '../services/ddfPhotoFetcher';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// ── CLI flags ─────────────────────────────────────────────────────────────────
const DRY_RUN   = process.argv.includes('--dry-run');
const NO_PHOTOS = process.argv.includes('--no-photos');

function getArg(name: string): string | null {
  const a = process.argv.find(x => x.startsWith(`--${name}=`));
  return a ? a.split('=').slice(1).join('=') : null;
}

const CITIES_ARG = getArg('cities');
const CITIES: string[] = CITIES_ARG
  ? CITIES_ARG.split(',').map(c => c.trim()).filter(Boolean)
  : ['Richmond Hill', 'Markham'];

// ── Constants ─────────────────────────────────────────────────────────────────
const PAGE_SIZE  = 100;
const PAGE_DELAY = 500;   // ms between pages — DDF full-feed, be reasonably fast
const MAX_PAGES  = 2000;

const COLUMNS = new Set([
  'external_id','mls_number','status','standard_status','property_class',
  'transaction_type','list_price','sold_price','original_price','list_date',
  'sold_date','last_status','street_number','street_name','street_suffix',
  'unit_number','city','state','zip','country','neighborhood','lat','lng',
  'bed','bath','bath_half','sqft','year_built','style','property_type',
  'description','images','agent_name','agent_email','brokerage','cooling',
  'heating','parking_total','garage_yn','photos_count','photos_timestamp',
  'board_id','realtor_link','updated_at',
  'association_fee','association_fee_frequency',
  'lot_frontage','lot_size_area','construction_materials','levels','ownership_type',
  'last_seen_at','category',
]);

const CDN_BASE = 'https://ddfcdn.realtor.ca/listings';

function buildCdnUrls(externalId: string | null, photosTimestamp: string | null, photosCount: number | null): string[] {
  if (!externalId || !photosTimestamp) return [];
  const count = Math.max(photosCount || 1, 1);
  const eid = externalId.toLowerCase();
  return Array.from({ length: count }, (_, i) =>
    `${CDN_BASE}/TS${photosTimestamp}/reb82/highres/4/${eid}_${i + 1}.jpg`
  );
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function toDbRow(raw: Record<string, any>): Record<string, any> {
  const mapped   = mapDDFToSupabase(raw);
  const filtered = Object.fromEntries(Object.entries(mapped).filter(([k]) => COLUMNS.has(k)));
  if (!filtered.id && filtered.mls_number) filtered.id = filtered.mls_number;
  // Never overwrite geocoded coordinates with null — omit lat/lng when DDF doesn't provide them
  if (filtered.lat == null) delete filtered.lat;
  if (filtered.lng == null) delete filtered.lng;
  return filtered;
}

// ── Supabase helpers ──────────────────────────────────────────────────────────

async function upsertBatch(rows: Record<string, any>[]): Promise<void> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/mls_listings?on_conflict=mls_number`,
    {
      method: 'POST',
      headers: {
        apikey:         SUPABASE_KEY,
        Authorization:  `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer:         'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(rows),
    }
  );
  if (!res.ok) throw new Error(`Upsert failed ${res.status}: ${await res.text()}`);
}

async function patchImages(mlsNumber: string, urls: string[]): Promise<void> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/mls_listings?mls_number=eq.${encodeURIComponent(mlsNumber)}`,
    {
      method: 'PATCH',
      headers: {
        apikey:         SUPABASE_KEY,
        Authorization:  `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer:         'return=minimal',
      },
      body: JSON.stringify({ images: urls }),
    }
  );
  if (!res.ok) throw new Error(`PATCH images ${res.status}: ${await res.text()}`);
}

async function fetchExistingTimestamps(mlsNumbers: string[]): Promise<Map<string, string | null>> {
  if (!mlsNumbers.length) return new Map();
  const list = mlsNumbers.map(n => `"${n}"`).join(',');
  const url  = `${SUPABASE_URL}/rest/v1/mls_listings?select=mls_number,photos_timestamp&mls_number=in.(${list})`;
  const res  = await fetch(url, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Accept: 'application/json' },
  });
  const map = new Map<string, string | null>();
  if (!res.ok) return map;
  const rows: any[] = await res.json();
  for (const r of rows) map.set(r.mls_number, r.photos_timestamp ?? null);
  return map;
}

// ── Full-feed scan with client-side city filter ───────────────────────────────
// DDF only accepts (LastUpdated=...) queries — all other DMQL fields are rejected.
// We fetch all listings using a far-past date and filter by city in TypeScript.

const CITY_SET = new Set(CITIES.map(c => c.toLowerCase()));
const DEBUG_CITIES = process.argv.includes('--debug-cities');
const seenCities = new Set<string>(); // for --debug-cities sampling

function matchesTargetCity(raw: Record<string, any>): boolean {
  // Apply same normalization as ListingAdapter.cleanCity:
  // strip trailing "(Neighbourhood)" qualifiers before comparing
  const raw_city = String(raw.City ?? raw.Municipality ?? raw.city ?? '');
  const city = raw_city.replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase();

  if (DEBUG_CITIES && city && !seenCities.has(city)) {
    seenCities.add(city);
    if (seenCities.size <= 40) console.log(`  [city sample] raw.City="${raw.City}" → normalized="${city}"`);
  }

  return CITY_SET.has(city);
}

async function scanAllAndFilter(
  rets: any,
  photoSession: DdfPhotoSession | null,
  counters: { scanned: number; fetched: number; upserted: number; photos: number }
): Promise<void> {
  // Only (LastUpdated=...) is accepted by this DDF server.
  // Active listings are always updated within ~2 years; 2023-01-01 captures all.
  const since = getArg('since') ?? '2023-01-01T00:00:00Z';
  const dmql = `(LastUpdated=${since})`;
  console.log(`[syncCities] DMQL: ${dmql}`);
  console.log(`[syncCities] Filtering to: ${CITIES.join(', ')}`);
  console.log(`[syncCities] Waiting for DDF page 1 response (may take 10–30s)…`);

  let offset = 1;
  let page   = 1;

  while (page <= MAX_PAGES) {
    process.stdout.write(`\r[syncCities] Page ${page} | scanned ${counters.scanned.toLocaleString()} | matched ${counters.fetched.toLocaleString()}   `);

    let results: any[];
    let totalCount: number | null = null;

    try {
      const response = await rets.search.query(
        'Property', 'Property', dmql,
        { limit: PAGE_SIZE, offset, count: 1, format: 'COMPACT', standardNames: 1 }
      );
      results    = response.results ?? [];
      totalCount = typeof response.count === 'number' ? response.count : null;
    } catch (e: any) {
      console.error(`\n[syncCities] Page ${page} failed: ${e.message} — stopping`);
      break;
    }

    if (results.length === 0) {
      console.log('\n[syncCities] No more results.');
      break;
    }

    if (totalCount !== null && page === 1) {
      console.log(`\n[syncCities] DDF total listings: ${totalCount.toLocaleString()}`);
    }

    counters.scanned += results.length;

    // Filter to target cities only
    const matched = results.filter(matchesTargetCity);
    counters.fetched += matched.length;

    if (!DRY_RUN && matched.length > 0) {
      const listingKeyByMls = new Map<string, string | number>();
      const ddfTsByMls      = new Map<string, string | null>();

      const dbRows = matched.map((raw) => {
        const row = toDbRow(raw);
        if (row.mls_number) {
          const key = raw.ListingKey ?? raw.ListingID ?? raw.id;
          if (key) listingKeyByMls.set(String(row.mls_number), key);
          ddfTsByMls.set(String(row.mls_number), row.photos_timestamp ?? null);
        }
        return row;
      });

      try {
        const mlsNums    = dbRows.map(r => r.mls_number).filter(Boolean) as string[];
        const existingTs = photoSession ? await fetchExistingTimestamps(mlsNums) : new Map<string, string | null>();

        await upsertBatch(dbRows);
        counters.upserted += dbRows.length;

        if (photoSession) {
          for (const row of dbRows) {
            const mls = row.mls_number;
            if (!mls) continue;
            const ddfTs = ddfTsByMls.get(mls) ?? null;
            const dbTs  = existingTs.get(mls) ?? null;
            if (existingTs.has(mls) && dbTs === ddfTs) continue;

            try {
              const key  = listingKeyByMls.get(mls) ?? row.id ?? mls;
              const urls = await photoSession.fetchPhotoUrls(key);
              if (urls.length > 0) {
                await patchImages(mls, urls);
                counters.photos++;
              } else {
                const cdnUrls = buildCdnUrls(row.external_id, row.photos_timestamp, row.photos_count);
                if (cdnUrls.length > 0) {
                  await patchImages(mls, cdnUrls);
                  counters.photos++;
                }
              }
            } catch (e: any) {
              console.warn(`\n  [photo] ${mls}: ${e.message}`);
            }
          }
        }
      } catch (e: any) {
        console.error(`\n[syncCities] Upsert failed page ${page}: ${e.message}`);
      }
    }

    if (results.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
    page++;
    await sleep(PAGE_DELAY);
  }
  console.log(''); // newline after progress line
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const loginUrl = process.env.DDF_LOGIN_URL!;
  const username  = process.env.DDF_USERNAME!;
  const password  = process.env.DDF_PASSWORD!;

  if (!loginUrl || !username || !password || !SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Missing required env vars: DDF_LOGIN_URL, DDF_USERNAME, DDF_PASSWORD, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  }

  console.log(`[syncCities] Cities: ${CITIES.join(', ')}`);
  if (DRY_RUN)   console.log('[syncCities] DRY RUN — no DB writes');
  if (NO_PHOTOS) console.log('[syncCities] Photos disabled');

  const counters = { scanned: 0, fetched: 0, upserted: 0, photos: 0 };

  await (getAutoLogoutClient as any)(
    { loginUrl, username, password, version: 'RETS/1.7.2', userAgent: 'Tourit-CitySync/1.0' },
    async (rets: any) => {

      let photoSession: DdfPhotoSession | null = null;
      if (!DRY_RUN && !NO_PHOTOS) {
        try {
          photoSession = new DdfPhotoSession(loginUrl, username, password);
          await photoSession.login();
          console.log('[syncCities] Photo session ready');
        } catch (e: any) {
          console.warn(`[syncCities] Photo session failed: ${e.message} — photos will be skipped`);
        }
      }

      await scanAllAndFilter(rets, photoSession, counters);
    }
  );

  console.log(`\n[syncCities] ── Done ──`);
  console.log(`  Cities   : ${CITIES.join(', ')}`);
  console.log(`  Scanned  : ${counters.scanned.toLocaleString()}`);
  console.log(`  Matched  : ${counters.fetched.toLocaleString()}`);
  console.log(`  Upserted : ${counters.upserted.toLocaleString()}`);
  console.log(`  Photos   : ${counters.photos.toLocaleString()}`);
  if (DRY_RUN) console.log('\nRe-run without --dry-run to write to DB.');
}

main().catch(err => {
  console.error('[syncCities] FAILED:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
