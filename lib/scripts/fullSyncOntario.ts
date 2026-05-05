/**
 * One-time full sync: pulls ALL active Ontario listings from DDF and upserts
 * them into mls_listings. No LastUpdated filter — fetches everything.
 *
 * Run ONCE to backfill the database, then let ddfSync / hourlySync take over.
 *
 *   npx ts-node lib/scripts/fullSyncOntario.ts
 *   npx ts-node lib/scripts/fullSyncOntario.ts --dry-run   (count only, no DB writes)
 *
 * Environment: DDF_LOGIN_URL, DDF_USERNAME, DDF_PASSWORD,
 *              SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import dotenv from 'dotenv';
import { getAutoLogoutClient } from 'rets-client';
import { mapDDFToSupabase } from '../adapters/ListingAdapter';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const DRY_RUN      = process.argv.includes('--dry-run');
const PAGE_SIZE    = 100;
const PAGE_DELAY   = 2000;   // ms between pages — be polite to DDF
const MAX_PAGES    = 1000;   // safety ceiling (~100k listings)

// DDF DMQL query — all active residential listings in Ontario
// StateOrProvince=ON covers Ontario; no LastUpdated constraint
const DMQL_QUERY = '(StateOrProvince=ON),(Status=A)';

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
  'last_seen_at',
]);

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function toDbRow(raw: Record<string, any>): Record<string, any> {
  const mapped   = mapDDFToSupabase(raw);
  const filtered = Object.fromEntries(Object.entries(mapped).filter(([k]) => COLUMNS.has(k)));
  if (!filtered.id && filtered.mls_number) filtered.id = filtered.mls_number;
  return filtered;
}

async function upsertBatch(rows: Record<string, any>[]): Promise<void> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/mls_listings?on_conflict=mls_number`,
    {
      method: 'POST',
      headers: {
        apikey:          SUPABASE_KEY,
        Authorization:   `Bearer ${SUPABASE_KEY}`,
        'Content-Type':  'application/json',
        Prefer:          'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(rows),
    }
  );
  if (!res.ok) throw new Error(`Upsert failed ${res.status}: ${await res.text()}`);
}

async function main() {
  const loginUrl = process.env.DDF_LOGIN_URL!;
  const username  = process.env.DDF_USERNAME!;
  const password  = process.env.DDF_PASSWORD!;

  if (!loginUrl || !username || !password || !SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Missing required env vars');
  }

  console.log(`[fullSync] Starting full Ontario sync`);
  console.log(`[fullSync] Query: ${DMQL_QUERY}`);
  if (DRY_RUN) console.log('[fullSync] DRY RUN — no DB writes');

  let totalUpserted = 0;
  let totalFetched  = 0;
  let page          = 1;
  let offset        = 1;

  await (getAutoLogoutClient as any)(
    { loginUrl, username, password, version: 'RETS/1.7.2', userAgent: 'Tourit-FullSync/1.0' },
    async (rets: any) => {
      while (page <= MAX_PAGES) {
        console.log(`[fullSync] Page ${page} (offset ${offset})…`);

        let results: any[];
        let totalCount: number | null = null;

        try {
          const response = await rets.search.query(
            'Property', 'Property',
            DMQL_QUERY,
            { limit: PAGE_SIZE, offset, count: 1, format: 'COMPACT', standardNames: 1 }
          );
          results    = response.results ?? [];
          totalCount = typeof response.count === 'number' ? response.count : null;
        } catch (e: any) {
          console.error(`[fullSync] Page ${page} failed: ${e.message} — stopping`);
          break;
        }

        if (results.length === 0) {
          console.log('[fullSync] No more results.');
          break;
        }

        totalFetched += results.length;
        if (totalCount !== null && page === 1) {
          console.log(`[fullSync] DDF reports ${totalCount} total matching listings`);
        }

        if (!DRY_RUN) {
          const dbRows = results.map(toDbRow);
          try {
            await upsertBatch(dbRows);
            totalUpserted += dbRows.length;
          } catch (e: any) {
            console.error(`[fullSync] Upsert failed on page ${page}: ${e.message}`);
          }
        }

        console.log(`[fullSync] Page ${page}: ${results.length} fetched, ${totalUpserted} upserted so far`);

        if (results.length < PAGE_SIZE) break;  // last page

        offset += PAGE_SIZE;
        page++;
        await sleep(PAGE_DELAY);
      }
    }
  );

  console.log(`\n[fullSync] Done. Fetched: ${totalFetched} | Upserted: ${totalUpserted}`);
  if (DRY_RUN) console.log('[fullSync] Re-run without --dry-run to write to DB.');
}

main().catch(err => {
  console.error('[fullSync] FAILED:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
