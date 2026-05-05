/**
 * Hourly incremental sync:
 *  1. Query DDF for listings updated in the last 70 minutes
 *  2. Upsert each listing into mls_listings
 *  3. Fetch photo URLs via GetObject and update the images column
 *
 * Run with:
 *   npx ts-node lib/services/hourlySync.ts
 */

import dotenv from 'dotenv';
import { getAutoLogoutClient } from 'rets-client';
import { mapDDFToSupabase } from '../adapters/ListingAdapter';
import { DdfPhotoSession } from './ddfPhotoFetcher';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

// ─── Supabase helpers ─────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function supabaseUpsert(rows: Record<string, any>[]): Promise<void> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/mls_listings?on_conflict=mls_number`,
    {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
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

// ─── Column allowlist ─────────────────────────────────────────────────────────

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

function toDbRow(raw: Record<string, any>): Record<string, any> {
  const mapped  = mapDDFToSupabase(raw);
  const filtered = Object.fromEntries(Object.entries(mapped).filter(([k]) => COLUMNS.has(k)));
  // ensure id is set
  if (!filtered.id && filtered.mls_number) filtered.id = filtered.mls_number;
  return filtered;
}

// ─── Photo timestamp helpers ──────────────────────────────────────────────────

function toDotNetTicks(value: any): string | null {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  const ticks = 621355968000000000n + BigInt(date.getTime()) * 10000n;
  return String(ticks);
}

async function fetchExistingTimestamps(mlsNumbers: string[]): Promise<Map<string, string | null>> {
  if (!mlsNumbers.length) return new Map();
  const list = mlsNumbers.map(n => `"${n}"`).join(',');
  const url = `${SUPABASE_URL}/rest/v1/mls_listings?select=mls_number,photos_timestamp&mls_number=in.(${list})`;
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Accept: 'application/json' },
  });
  const map = new Map<string, string | null>();
  if (!res.ok) return map;
  const rows: any[] = await res.json();
  for (const r of rows) map.set(r.mls_number, r.photos_timestamp ?? null);
  return map;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const loginUrl = process.env.DDF_LOGIN_URL!;
  const username  = process.env.DDF_USERNAME!;
  const password  = process.env.DDF_PASSWORD!;

  if (!loginUrl || !username || !password || !SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Missing required env vars');
  }

  // Timestamp for 70 minutes ago in ISO format (DDF expects UTC)
  const since = new Date(Date.now() - 70 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  console.log(`[hourly] Querying DDF for listings updated since ${since}`);

  // ── Step 1: Search ────────────────────────────────────────────────────────
  const rawListings: any[] = await (getAutoLogoutClient as any)(
    { loginUrl, username, password, version: 'RETS/1.7.2', userAgent: 'Tourit-Hourly/1.0' },
    async (rets: any) => {
      const result = await rets.search.query(
        'Property', 'Property',
        `(LastUpdated=${since})`,
        { limit: 500, offset: 1, count: 1, format: 'COMPACT', standardNames: 1 }
      );
      const rows = result.results ?? [];
      console.log(`[hourly] DDF returned ${rows.length} listing(s) (total count: ${result.count ?? '?'})`);
      return rows;
    }
  );

  if (rawListings.length === 0) {
    console.log('[hourly] Nothing to update.');
    return;
  }

  // ── Step 2: Upsert listing data ───────────────────────────────────────────
  const dbRows = rawListings.map(toDbRow);
  await supabaseUpsert(dbRows);
  console.log(`[hourly] Upserted ${dbRows.length} listing(s).`);

  // ── Step 3: Fetch & store photos (only if photos_timestamp changed) ──────────
  const mlsNums = dbRows.map(r => String(r.mls_number ?? '')).filter(Boolean);
  const existingTs = await fetchExistingTimestamps(mlsNums);

  // Determine which listings actually need a GetObject call
  const needsPhoto = rawListings.filter((raw, i) => {
    const mls = String(dbRows[i].mls_number ?? '');
    if (!mls) return false;
    const ddfTs = toDotNetTicks(raw.PhotosChangeTimestamp ?? raw.photosChangeTimestamp);
    const dbTs  = existingTs.get(mls) ?? null;
    return ddfTs !== dbTs; // fetch only when timestamp changed or listing is new
  });

  console.log(`[hourly] ${needsPhoto.length}/${rawListings.length} listing(s) need photo update`);

  if (!needsPhoto.length) {
    console.log(`\n[hourly] Done. Listings: ${dbRows.length} | Photos: all unchanged`);
    return;
  }

  const photoSession = new DdfPhotoSession(loginUrl, username, password);
  await photoSession.login();

  let photoOk = 0;
  let photoFail = 0;

  for (const raw of needsPhoto) {
    const mlsNumber  = String(raw.ListingId ?? raw.ListingID ?? raw.MLS_NUM ?? raw.MlsNumber ?? raw.ListingKey ?? '');
    const listingKey = raw.ListingKey ?? raw.ListingID ?? mlsNumber;
    if (!listingKey || !mlsNumber) continue;

    try {
      const urls = await photoSession.fetchPhotoUrls(listingKey);
      if (urls.length > 0) {
        await patchImages(mlsNumber, urls);
        console.log(`[photo] ${mlsNumber} (key=${listingKey}): ${urls.length} photo(s) saved`);
        photoOk++;
      } else {
        console.log(`[photo] ${mlsNumber}: 0 URLs returned`);
      }
    } catch (e: any) {
      console.warn(`[photo] ${mlsNumber}: ${e.message}`);
      photoFail++;
    }
  }

  console.log(`\n[hourly] Done. Listings: ${dbRows.length} | Photos OK: ${photoOk} | Photo errors: ${photoFail}`);
}

main().catch(err => {
  console.error('[hourly] FAILED:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
