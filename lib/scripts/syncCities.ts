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
const PAGE_DELAY = 1500;
const MAX_PAGES  = 500;

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

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function toDbRow(raw: Record<string, any>): Record<string, any> {
  const mapped   = mapDDFToSupabase(raw);
  const filtered = Object.fromEntries(Object.entries(mapped).filter(([k]) => COLUMNS.has(k)));
  if (!filtered.id && filtered.mls_number) filtered.id = filtered.mls_number;
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

// ── Per-city paginated sync (runs inside one RETS session) ────────────────────

async function syncOneCity(
  rets: any,
  city: string,
  photoSession: DdfPhotoSession | null,
  counters: { fetched: number; upserted: number; photos: number }
): Promise<void> {
  // DDF server requires single-value City queries
  const dmql = `(City=${city}),(Status=A)`;
  console.log(`\n[syncCities] ── City: ${city} ──`);
  console.log(`[syncCities] DMQL: ${dmql}`);

  let offset = 1;
  let page   = 1;

  while (page <= MAX_PAGES) {
    console.log(`[syncCities] ${city} — page ${page} (offset ${offset})…`);

    let results: any[];
    let totalCount: number | null = null;

    try {
      const response = await rets.search.query(
        'Property', 'Property',
        dmql,
        { limit: PAGE_SIZE, offset, count: 1, format: 'COMPACT', standardNames: 1 }
      );
      results    = response.results ?? [];
      totalCount = typeof response.count === 'number' ? response.count : null;
    } catch (e: any) {
      console.error(`[syncCities] ${city} page ${page} failed: ${e.message} — skipping city`);
      break;
    }

    if (results.length === 0) {
      console.log(`[syncCities] ${city}: no more results.`);
      break;
    }

    counters.fetched += results.length;
    if (totalCount !== null && page === 1) {
      console.log(`[syncCities] ${city}: DDF reports ${totalCount.toLocaleString()} total listings`);
    }

    if (!DRY_RUN) {
      const listingKeyByMls = new Map<string, string | number>();
      const ddfTsByMls      = new Map<string, string | null>();

      const dbRows = results.map((raw) => {
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
            const isNew = !existingTs.has(mls);
            if (!isNew && dbTs === ddfTs) continue;

            try {
              const key  = listingKeyByMls.get(mls) ?? row.id ?? mls;
              const urls = await photoSession.fetchPhotoUrls(key);
              if (urls.length > 0) {
                await patchImages(mls, urls);
                counters.photos++;
                console.log(`  [photo] ${mls}: ${urls.length} photo(s)`);
              }
            } catch (e: any) {
              console.warn(`  [photo] ${mls}: ${e.message}`);
            }
          }
        }
      } catch (e: any) {
        console.error(`[syncCities] ${city} upsert failed page ${page}: ${e.message}`);
      }
    }

    console.log(`[syncCities] ${city} page ${page}: ${results.length} fetched | ${counters.upserted} total upserted`);

    if (results.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
    page++;
    await sleep(PAGE_DELAY);
  }
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

  const counters = { fetched: 0, upserted: 0, photos: 0 };

  await (getAutoLogoutClient as any)(
    { loginUrl, username, password, version: 'RETS/1.7.2', userAgent: 'Tourit-CitySync/1.0' },
    async (rets: any) => {

      // One photo session shared across all cities
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

      // Query each city individually (DDF server rejects multi-value City queries)
      for (const city of CITIES) {
        await syncOneCity(rets, city, photoSession, counters);
      }
    }
  );

  console.log(`\n[syncCities] ── Done ──`);
  console.log(`  Cities   : ${CITIES.join(', ')}`);
  console.log(`  Fetched  : ${counters.fetched.toLocaleString()}`);
  console.log(`  Upserted : ${counters.upserted.toLocaleString()}`);
  console.log(`  Photos   : ${counters.photos.toLocaleString()}`);
  if (DRY_RUN) console.log('\nRe-run without --dry-run to write to DB.');
}

main().catch(err => {
  console.error('[syncCities] FAILED:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
