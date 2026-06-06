/**
 * Hourly incremental sync:
 *  1. Query DDF for listings updated in the last 4 hours (paginated, no 500-limit dead zone)
 *  2. Upsert each listing into mls_listings (via direct PostgreSQL)
 *  3. Fetch photo URLs via GetObject and update the images column
 *
 * Run with:
 *   npx ts-node lib/services/hourlySync.ts
 */

import dotenv from 'dotenv';
import { getAutoLogoutClient } from 'rets-client';
import { mapDDFToSupabase } from '../adapters/ListingAdapter';
import { DdfPhotoSession } from './ddfPhotoFetcher';
import { upsertListings, patchImages, fetchExistingTimestamps } from '../db';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

// ─── Column allowlist ─────────────────────────────────────────────────────────

const COLUMNS = new Set([
  'external_id','mls_number','status','standard_status','property_class',
  'transaction_type','list_price','sold_price','original_price','list_date',
  'sold_date','last_status','street_number','street_name','street_suffix',
  'unit_number','city','state','zip','country','neighborhood','lat','lng',
  'bed','bath','bath_half','beds_above_grade','basement_beds','sqft','year_built','style','property_type',
  'description','images','agent_name','agent_email','brokerage','cooling',
  'heating','parking_total','garage_yn','photos_count','photos_timestamp',
  'board_id','realtor_link','updated_at',
  'association_fee','association_fee_frequency',
  'lot_frontage','lot_size_area','construction_materials','levels','ownership_type',
  'last_seen_at','category',
]);

function toDbRow(raw: Record<string, any>): Record<string, any> {
  const mapped   = mapDDFToSupabase(raw);
  const filtered = Object.fromEntries(Object.entries(mapped).filter(([k]) => COLUMNS.has(k)));
  if (!filtered.id && filtered.mls_number) filtered.id = filtered.mls_number;
  if (filtered.lat == null) delete filtered.lat;
  if (filtered.lng == null) delete filtered.lng;
  delete filtered.images;
  filtered.last_seen_at = new Date().toISOString();
  return filtered;
}

function toDotNetTicks(value: any): string | null {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  const ticks = 621355968000000000n + BigInt(date.getTime()) * 10000n;
  return String(ticks);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const loginUrl = process.env.DDF_LOGIN_URL!;
  const username  = process.env.DDF_USERNAME!;
  const password  = process.env.DDF_PASSWORD!;

  if (!loginUrl || !username || !password || !process.env.DATABASE_URL) {
    throw new Error('Missing required env vars (DDF_LOGIN_URL, DDF_USERNAME, DDF_PASSWORD, DATABASE_URL)');
  }

  // 4-hour lookback — cron runs every 3h, extra buffer for slow DDF updates
  const since = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  console.log(`[hourly] Querying DDF for listings updated since ${since}`);

  // ── Step 1: Paginated search ───────────────────────────────────────────────
  const PAGE_SIZE = 500;
  const MAX_PAGES = 40; // safety cap: 40 × 500 = 20 000 listings max per run

  const rawListings: any[] = await (getAutoLogoutClient as any)(
    { loginUrl, username, password, version: 'RETS/1.7.2', userAgent: 'Tourit-Hourly/1.0' },
    async (rets: any) => {
      const all: any[] = [];
      let offset = 1;
      let page   = 1;
      let total: number | null = null;

      while (page <= MAX_PAGES) {
        console.log(`[hourly] Page ${page} (offset ${offset})…`);
        const result = await rets.search.query(
          'Property', 'Property',
          `(LastUpdated=${since})`,
          { limit: PAGE_SIZE, offset, count: 1, format: 'COMPACT', standardNames: 1 }
        );
        const rows = result.results ?? [];
        if (page === 1) {
          total = typeof result.count === 'number' ? result.count : null;
          console.log(`[hourly] DDF total count: ${total ?? 'unknown'}`);
        }
        all.push(...rows);
        console.log(`[hourly] Page ${page}: got ${rows.length} row(s), cumulative ${all.length}`);

        // Stop when last page reached
        const done = rows.length < PAGE_SIZE ||
          (total !== null && all.length >= total);
        if (done) break;

        offset += PAGE_SIZE;
        page++;
        await sleep(1500); // be polite to DDF server
      }

      if (page > MAX_PAGES) {
        console.warn(`[hourly] Hit page cap (${MAX_PAGES}) — some listings may be missing.`);
      }

      return all;
    }
  );

  if (rawListings.length === 0) {
    console.log('[hourly] Nothing to update.');
    return;
  }

  console.log(`[hourly] Fetched ${rawListings.length} listing(s) from DDF.`);

  // ── Step 2: Capture existing timestamps BEFORE upsert ─────────────────────
  const dbRows  = rawListings.map(toDbRow);
  const mlsNums = dbRows.map(r => String(r.mls_number ?? '')).filter(Boolean);
  const existingTs = await fetchExistingTimestamps(mlsNums);

  const newCount    = mlsNums.filter(m => !existingTs.has(m)).length;
  const updateCount = mlsNums.length - newCount;

  await upsertListings(dbRows);
  console.log(`[hourly] Upserted ${dbRows.length} listing(s) — ✨ ${newCount} new, ${updateCount} updated.`);

  // ── Step 3: Fetch & store photos (only if photos_timestamp changed) ────────
  const needsPhoto = rawListings.filter((raw, i) => {
    const mls   = String(dbRows[i].mls_number ?? '');
    if (!mls) return false;
    const ddfTs = toDotNetTicks(raw.PhotosChangeTimestamp ?? raw.photosChangeTimestamp);
    const dbTs  = existingTs.get(mls) ?? null;
    return ddfTs !== dbTs;
  });

  console.log(`[hourly] ${needsPhoto.length}/${rawListings.length} listing(s) need photo update`);

  if (!needsPhoto.length) {
    console.log(`\n[hourly] Done. Listings: ${dbRows.length} | Photos: all unchanged`);
    return;
  }

  const photoSession = new DdfPhotoSession(loginUrl, username, password);
  await photoSession.login();

  let photoOk = 0, photoFail = 0;

  for (const raw of needsPhoto) {
    const mlsNumber  = String(raw.ListingId ?? raw.ListingID ?? raw.MLS_NUM ?? raw.MlsNumber ?? raw.ListingKey ?? '');
    const listingKey = raw.ListingKey ?? raw.ListingID ?? mlsNumber;
    if (!listingKey || !mlsNumber) continue;
    try {
      const urls = await photoSession.fetchPhotoUrls(listingKey);
      if (urls.length > 0) {
        await patchImages(mlsNumber, urls);
        console.log(`[photo] ${mlsNumber}: ${urls.length} photo(s) saved`);
        photoOk++;
      }
    } catch (e: any) {
      console.warn(`[photo] ${mlsNumber}: ${e.message}`);
      photoFail++;
    }
  }

  console.log(`\n[hourly] Done. Listings: ${dbRows.length} | Photos OK: ${photoOk} | Errors: ${photoFail}`);
}

main().catch(err => {
  console.error('[hourly] FAILED:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
