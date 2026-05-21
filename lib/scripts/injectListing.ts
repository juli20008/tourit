/**
 * Fetch a single listing from DDF by MLS number and inject it into Supabase.
 * Also fetches photos via GetObject.
 *
 * Usage:
 *   npx ts-node lib/scripts/injectListing.ts --mls=N13106358
 *   npx ts-node lib/scripts/injectListing.ts --mls=N13106358 --since=2024-01-01
 */

import dotenv from 'dotenv';
import { getAutoLogoutClient } from 'rets-client';
import { mapDDFToSupabase } from '../adapters/ListingAdapter';
import { DdfPhotoSession } from '../services/ddfPhotoFetcher';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

// ─── Args ─────────────────────────────────────────────────────────────────────

function getArg(name: string): string | null {
  const a = process.argv.find(x => x.startsWith(`--${name}=`));
  return a ? a.split('=').slice(1).join('=') : null;
}

const TARGET_MLS = getArg('mls');
if (!TARGET_MLS) {
  console.error('Usage: npx ts-node lib/scripts/injectListing.ts --mls=N13106358');
  process.exit(1);
}

const SINCE     = getArg('since') ?? '2025-01-01T00:00:00Z';
const PAGE_SIZE = 100;

// ─── Supabase helpers ─────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function supabaseUpsert(row: Record<string, any>): Promise<void> {
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
      body: JSON.stringify([row]),
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

// ─── Column allowlist (mirrors hourlySync.ts) ─────────────────────────────────

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
  if (!filtered.lat) delete filtered.lat;
  if (!filtered.lng) delete filtered.lng;
  delete filtered.images; // managed separately via patchImages
  return filtered;
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const loginUrl = process.env.DDF_LOGIN_URL!;
  const username  = process.env.DDF_USERNAME!;
  const password  = process.env.DDF_PASSWORD!;

  if (!loginUrl || !username || !password || !SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Missing required env vars: DDF_LOGIN_URL / DDF_USERNAME / DDF_PASSWORD / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  }

  console.log(`[inject] Searching for MLS ${TARGET_MLS} (since ${SINCE})…`);

  let foundRaw: any = null;

  await (getAutoLogoutClient as any)(
    { loginUrl, username, password, version: 'RETS/1.7.2', userAgent: 'Tourit-Inject/1.0' },
    async (rets: any) => {
      const dmql = `(LastUpdated=${SINCE})`;
      let offset = 1;
      let page   = 1;

      while (!foundRaw) {
        process.stdout.write(`\r[inject] Page ${page} (offset ${offset})…   `);

        let results: any[];
        try {
          const response = await rets.search.query(
            'Property', 'Property', dmql,
            { limit: PAGE_SIZE, offset, count: page === 1 ? 1 : 0, format: 'COMPACT', standardNames: 1 }
          );
          results = response.results ?? [];
          if (page === 1 && response.count) {
            console.log(`\n[inject] DDF total in range: ${response.count.toLocaleString()}`);
          }
        } catch (e: any) {
          console.error(`\n[inject] DDF error on page ${page}: ${e.message}`);
          break;
        }

        if (!results.length) {
          console.log(`\n[inject] End of feed — ${TARGET_MLS} not found in range since ${SINCE}.`);
          console.log(`Try: --since=2024-01-01`);
          break;
        }

        for (const item of results) {
          const mls = String(
            item.ListingId ?? item.ListingID ?? item.MLS_NUM ?? item.MlsNumber ?? item.ListingKey ?? ''
          );
          if (mls === TARGET_MLS) {
            foundRaw = item;
            console.log(`\n[inject] ✓ Found ${TARGET_MLS}`);
            break;
          }
        }

        if (foundRaw) break;
        if (results.length < PAGE_SIZE) {
          console.log(`\n[inject] End of feed — ${TARGET_MLS} not found.`);
          break;
        }

        offset += PAGE_SIZE;
        page++;
        await sleep(300);
      }
    }
  );

  if (!foundRaw) {
    console.error('[inject] Listing not found — aborting.');
    process.exitCode = 1;
    return;
  }

  // ── Upsert listing data ────────────────────────────────────────────────────
  const dbRow = toDbRow(foundRaw);
  console.log(`[inject] Upserting ${TARGET_MLS} (${dbRow.city}, $${dbRow.list_price})…`);
  await supabaseUpsert(dbRow);
  console.log(`[inject] ✓ Upserted into mls_listings`);

  // ── Fetch photos ───────────────────────────────────────────────────────────
  const listingKey: string = foundRaw.ListingKey ?? foundRaw.ListingID ?? TARGET_MLS!;
  console.log(`[inject] Fetching photos (listingKey=${listingKey})…`);

  const photoSession = new DdfPhotoSession(loginUrl, username, password);
  await photoSession.login();

  let urls: string[] = [];
  try {
    urls = await photoSession.fetchPhotoUrls(listingKey);
  } catch (e: any) {
    console.warn(`[inject] Photo fetch error: ${e.message}`);
  }

  if (urls.length > 0) {
    await patchImages(TARGET_MLS!, urls);
    console.log(`[inject] ✓ Saved ${urls.length} photo(s)`);
  } else {
    console.log(`[inject] No photos returned for ${TARGET_MLS}`);
  }

  console.log(`\n[inject] Done. ${TARGET_MLS} is now in the database.`);
}

main().catch(e => {
  console.error('[inject] FATAL:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
