/**
 * Fetches active Markham listings from CREA DDF via RETS and maps
 * them to the Supabase mls_listings schema using ListingAdapter.
 *
 * Run directly for testing:
 *   npx ts-node lib/adapters/ddfFetcher.ts
 *
 * Environment variables (.env + .env.local):
 *   DDF_LOGIN_URL, DDF_USERNAME, DDF_PASSWORD, DATABASE_URL
 */

import '../env';

import { getAutoLogoutClient } from 'rets-client';
import { Pool } from 'pg';
import { adaptListing, DdfRaw, SupabaseListing } from './ListingAdapter';

const LOGIN_URL   = process.env.DDF_LOGIN_URL ?? '';
const USERNAME    = process.env.DDF_USERNAME  ?? '';
const PASSWORD    = process.env.DDF_PASSWORD  ?? '';

const RESOURCE    = 'Property';
const CLASS       = 'ResidentialProperty'; // swap to 'CondoProperty' for condos
const DMQL_QUERY  = '(City=Markham),(Status=Active)';
const FETCH_LIMIT = 10;

/**
 * Photo fetching stub — CREA DDF returns binary payloads via GetObject.
 * You need to upload each image to storage (e.g. Supabase Storage) to
 * get a public URL before storing.  Extend this once you have a pipeline.
 */
async function fetchPhotos(_client: any, _mlsNum: string): Promise<string[]> {
  // const result = await _client.objects.getAllObjects(RESOURCE, 'Photo', _mlsNum, { alwaysGroupObjects: true });
  // return await uploadPhotosToStorage(result.objects);
  return [];
}

/**
 * Connects to CREA DDF, runs the Markham Active search, adapts each
 * record to the Supabase schema, and returns the array of rows.
 */
export async function fetchMarkhamListings(): Promise<SupabaseListing[]> {
  if (!LOGIN_URL || !USERNAME || !PASSWORD) {
    throw new Error('DDF_LOGIN_URL, DDF_USERNAME, and DDF_PASSWORD must be set in the environment.');
  }

  const listings: SupabaseListing[] = [];

  await (getAutoLogoutClient as any)(
    {
      loginUrl:          LOGIN_URL,
      username:          USERNAME,
      password:          PASSWORD,
      version:           'RETS/1.7.2',
      userAgent:         'RETS-Tourit/1.0',
      userAgentPassword: '',
    },
    async (client: any) => {
      const searchResult = await client.search.query(
        RESOURCE,
        CLASS,
        DMQL_QUERY,
        { limit: FETCH_LIMIT, offset: 0 },
      );

      const rows = (searchResult.results ?? []) as DdfRaw[];

      for (const row of rows) {
        const mlsNum = row['MLS_NUM'];
        const images = mlsNum ? await fetchPhotos(client, mlsNum) : [];
        listings.push(adaptListing(row, images));
      }

      console.log(`✓ Fetched ${listings.length} listing(s) from DDF.`);
      if (searchResult.maxRowsExceeded) {
        console.log('  (server has more results — increase FETCH_LIMIT or add pagination)');
      }
    },
  );

  return listings;
}

/**
 * Upsert a batch of adapted listings into the Supabase mls_listings table.
 * Conflict resolution: update all fields when mls_number already exists.
 */
export async function upsertListings(listings: SupabaseListing[]): Promise<void> {
  if (!listings.length) return;

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const cols = [
    'mls_number','status','standard_status','property_class','transaction_type',
    'list_price','sold_price','original_price','list_date','sold_date','last_status',
    'street_number','street_name','street_suffix','unit_number',
    'city','state','zip','country','neighborhood',
    'lat','lng',
    'bed','bath','sqft','year_built','style','property_type','description',
    'images','agent_name','agent_email','brokerage',
    'external_id','photos_timestamp','photos_count',
    'updated_at',
  ] as const;

  const placeholderRow = (i: number) =>
    '(' + cols.map((_, j) => `$${i * cols.length + j + 1}`).join(',') + ')';

  const values: unknown[] = [];
  listings.forEach((l) => {
    cols.forEach((col) => {
      if (col === 'updated_at') {
        values.push(new Date().toISOString());
      } else if (col === 'images') {
        values.push(JSON.stringify(l.images ?? []));
      } else {
        values.push((l as any)[col] ?? null);
      }
    });
  });

  const updateCols = cols
    .filter(c => c !== 'mls_number')
    .map(c => `${c} = EXCLUDED.${c}`)
    .join(', ');

  const sql = `
    INSERT INTO mls_listings (${cols.join(',')})
    VALUES ${listings.map((_, i) => placeholderRow(i)).join(',')}
    ON CONFLICT (mls_number) DO UPDATE SET ${updateCols};
  `;

  try {
    await pool.query(sql, values);
    console.log(`✓ Upserted ${listings.length} listing(s) into mls_listings.`);
  } finally {
    await pool.end();
  }
}

// ── Run directly ──────────────────────────────────────────────────────────────
if (require.main === module) {
  (async () => {
    const listings = await fetchMarkhamListings();
    if (listings.length) {
      console.log('\nSample record:');
      const { mls_number, city, list_price, lat, lng } = listings[0];
      console.log({ mls_number, city, list_price, lat, lng });
      await upsertListings(listings);
    }
  })().catch((err: Error) => {
    console.error('Failed:', err.message);
    process.exit(1);
  });
}
