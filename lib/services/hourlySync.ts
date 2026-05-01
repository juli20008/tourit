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
]);

function toDbRow(raw: Record<string, any>): Record<string, any> {
  const mapped  = mapDDFToSupabase(raw);
  const filtered = Object.fromEntries(Object.entries(mapped).filter(([k]) => COLUMNS.has(k)));
  // ensure id is set
  if (!filtered.id && filtered.mls_number) filtered.id = filtered.mls_number;
  return filtered;
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

  // ── Step 3: Fetch & store photos ──────────────────────────────────────────
  const photoSession = new DdfPhotoSession(loginUrl, username, password);
  await photoSession.login();

  let photoOk = 0;
  let photoFail = 0;

  for (let i = 0; i < rawListings.length; i++) {
    const raw = rawListings[i];
    const listingKey = raw.ListingKey ?? raw.ListingID;
    const mlsNumber  = String(dbRows[i].mls_number ?? '');
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
