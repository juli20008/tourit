import dotenv from 'dotenv';
import { getAutoLogoutClient } from 'rets-client';
import { mapDDFToSupabase } from '../adapters/ListingAdapter';
import { DdfPhotoSession } from './ddfPhotoFetcher';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });
console.log('Using URL:', process.env.SUPABASE_URL);


type DdfRaw = Record<string, any>;

type SupabaseRow = Record<string, any>;

const SUPABASE_COLUMNS = new Set([
  'external_id',
  'mls_number',
  'status',
  'standard_status',
  'property_class',
  'transaction_type',
  'list_price',
  'sold_price',
  'original_price',
  'list_date',
  'sold_date',
  'last_status',
  'street_number',
  'street_name',
  'street_suffix',
  'unit_number',
  'city',
  'state',
  'zip',
  'country',
  'neighborhood',
  'lat',
  'lng',
  'bed',
  'bath',
  'bath_half',
  'sqft',
  'year_built',
  'style',
  'property_type',
  'description',
  'images',
  'agent_name',
  'agent_email',
  'brokerage',
  'parking_total',
  'garage_yn',
  'cooling',
  'heating',
  'photos_count',
  'photos_timestamp',
  'board_id',
  'realtor_link',
  'updated_at',
  'association_fee',
  'association_fee_frequency',
  'lot_frontage',
  'lot_size_area',
  'construction_materials',
  'levels',
  'ownership_type',
]);

type SupabaseClientLike = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{ data: SupabaseRow | null; error: any }>;
      };
    };
    upsert: (rows: SupabaseRow | SupabaseRow[], options?: { onConflict?: string }) => Promise<{ data: any; error: any }>;
  };
};

function createSupabaseClient(): SupabaseClientLike {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.');
  }

  return {
    from(table: string) {
      return {
        select(columns: string) {
          return {
            eq(column: string, value: string) {
              return {
                async maybeSingle() {
                  const endpoint = new URL(`/rest/v1/${table}`, url);
                  endpoint.searchParams.set('select', columns);
                  endpoint.searchParams.set(column, `eq.${value}`);

                  const response = await fetch(endpoint.toString(), {
                    method: 'GET',
                    headers: {
                      apikey: key,
                      Authorization: `Bearer ${key}`,
                      Accept: 'application/json',
                    },
                  });

                  if (!response.ok) {
                    const text = await response.text();
                    return {
                      data: null,
                      error: new Error(`Supabase select failed (${response.status}): ${text}`),
                    };
                  }

                  const data = (await response.json()) as SupabaseRow[];
                  return {
                    data: data[0] ?? null,
                    error: null,
                  };
                },
              };
            },
          };
        },
        async upsert(rows: SupabaseRow | SupabaseRow[], options?: { onConflict?: string }) {
          const payload = Array.isArray(rows) ? rows : [rows];
          const endpoint = new URL(`/rest/v1/${table}`, url).toString();
          const conflict = options?.onConflict ? `?on_conflict=${encodeURIComponent(options.onConflict)}` : '';

          const response = await fetch(endpoint + conflict, {
            method: 'POST',
            headers: {
              apikey: key,
              Authorization: `Bearer ${key}`,
              'Content-Type': 'application/json',
              Prefer: 'resolution=merge-duplicates,return=representation',
            },
            body: JSON.stringify(payload),
          });

          if (!response.ok) {
            const text = await response.text();
            return { data: null, error: { status: response.status, message: text } };
          }

          const text = await response.text();
          let data: any = null;
          if (text) {
            try {
              data = JSON.parse(text);
            } catch {
              data = text;
            }
          }
          return { data, error: null };
        },
      };
    },
  };
}

function toDbRow(row: SupabaseRow): SupabaseRow {
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => SUPABASE_COLUMNS.has(key))
  );
}

// Returns a map of mls_number → { photos_timestamp, hasImages } from the DB.
async function fetchExistingPhotoState(
  mlsNumbers: string[]
): Promise<Map<string, { photos_timestamp: string | null; hasImages: boolean }>> {
  const url  = process.env.SUPABASE_URL!;
  const key  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const list = mlsNumbers.map(n => `"${n}"`).join(',');
  const endpoint = `${url}/rest/v1/mls_listings?select=mls_number,photos_timestamp,images&mls_number=in.(${list})`;

  const res = await fetch(endpoint, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
  });
  const map = new Map<string, { photos_timestamp: string | null; hasImages: boolean }>();
  if (!res.ok) return map;
  const rows: any[] = await res.json();
  for (const r of rows) {
    const imgs = r.images;
    map.set(r.mls_number, {
      photos_timestamp: r.photos_timestamp ?? null,
      hasImages: Array.isArray(imgs) ? imgs.length > 0 : Boolean(imgs),
    });
  }
  return map;
}

// Patches only the images column for one listing.
async function patchListingImages(mlsNumber: string, urls: string[]): Promise<void> {
  const url  = process.env.SUPABASE_URL!;
  const key  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const res  = await fetch(`${url}/rest/v1/mls_listings?mls_number=eq.${encodeURIComponent(mlsNumber)}`, {
    method: 'PATCH',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ images: urls }),
  });
  if (!res.ok) throw new Error(`PATCH images ${res.status}: ${await res.text()}`);
}

function truncateStringFields(row: SupabaseRow): SupabaseRow {
  const truncate = (value: any, max = 250) =>
    typeof value === 'string' ? value.substring(0, max) : value;

  return {
    ...row,
    city: truncate(row.city),
    neighborhood: truncate(row.neighborhood),
    agent_name: truncate(row.agent_name),
  };
}

function prepareRowForInsert(row: SupabaseRow): SupabaseRow {
  const prepared = { ...row };
  if (!prepared.id && prepared.mls_number) {
    prepared.id = prepared.mls_number;
  }
  return prepared;
}

function getListingKey(row: SupabaseRow): string {
  return String(row.mls_number ?? row.external_id ?? row.id ?? 'unknown');
}

async function processPageListings(
  supabase: SupabaseClientLike,
  pageItems: DdfRaw[],
  pageNumber: number,
  latestModificationRef: { value: string },
  photoSession: DdfPhotoSession | null
): Promise<{ successCount: number; failCount: number }> {
  console.log(`DEBUG: Starting mapping for Page ${pageNumber}`);

  // Build mapped rows; track DDF photo timestamp and original ListingKey per mls_number
  const ddfTimestampByMls  = new Map<string, string | null>();
  const listingKeyByMls    = new Map<string, string | number>(); // numeric DDF key for GetObject
  const batchData = pageItems.map((item) => {
    const itemModification = getRecordModificationTimestamp(item);
    if (itemModification && itemModification > latestModificationRef.value) {
      latestModificationRef.value = itemModification;
    }

    const mapped = mapDDFToSupabase(item);
    const row = prepareRowForInsert(truncateStringFields(toDbRow(mapped)));

    if (row.mls_number) {
      ddfTimestampByMls.set(String(row.mls_number), row.photos_timestamp ?? null);
      // ListingKey is the numeric DDF key; keep it before toDbRow strips non-column fields
      const ddfListingKey = item.ListingKey ?? item.ListingID ?? item.id;
      if (ddfListingKey) listingKeyByMls.set(String(row.mls_number), ddfListingKey);
    }
    return row;
  });

  console.log(`Prepared ${batchData.length} record(s) for Supabase on page ${pageNumber}.`);
  if (batchData.length > 0) {
    console.log('SAMPLE RECORD TO BE SAVED:', JSON.stringify(batchData[0], null, 2));
  }

  // Read existing photo state BEFORE upsert so we can compare timestamps
  const mlsNumbers = batchData.map(r => r.mls_number).filter(Boolean) as string[];
  const existingState = photoSession ? await fetchExistingPhotoState(mlsNumbers) : new Map();

  let successCount = 0;
  let failCount = 0;

  console.log('--- DB PUSH ATTEMPT ---');
  try {
    const { data, error } = await supabase.from('mls_listings').upsert(batchData, { onConflict: 'mls_number' });
    if (error) {
      console.error('DATABASE REJECTED DATA:', JSON.stringify(error));
      throw new Error(error.message ?? 'Bulk upsert rejected by database.');
    }
    successCount = Array.isArray(data) ? data.length : batchData.length;
    if (!successCount) {
      throw new Error('Bulk upsert returned no rows.');
    }
  } catch (bulkError: unknown) {
    const message = bulkError instanceof Error ? bulkError.message : String(bulkError);
    console.error(`Bulk upsert failed on page ${pageNumber}: ${message}`);
    const diagnosticItems = batchData.slice(0, 5);
    for (const item of diagnosticItems) {
      try {
        const { error } = await supabase.from('mls_listings').upsert(item);
        if (error) {
          failCount += 1;
          console.log('DEBUG ERROR for ' + getListingKey(item) + ': ', error);
          continue;
        }
        successCount += 1;
      } catch (itemError: unknown) {
        failCount += 1;
        const itemMessage = itemError instanceof Error ? itemError.message : String(itemError);
        console.log('DEBUG ERROR for ' + getListingKey(item) + ': ', itemError);
        console.error(`Skipping Listing ${getListingKey(item)}: ${itemMessage}`);
      }
    }
  }

  console.log(`Page ${pageNumber}: Saved ${successCount} records, ${failCount} skipped.`);

  // ── Photo update: fetch URLs for listings whose timestamp changed ─────────
  if (photoSession) {
    for (const row of batchData) {
      const mls = row.mls_number;
      if (!mls) continue;

      const ddfTs  = ddfTimestampByMls.get(mls) ?? null;
      const dbState = existingState.get(mls);

      const needsUpdate =
        !dbState ||                             // new listing
        !dbState.hasImages ||                   // no photos yet
        dbState.photos_timestamp !== ddfTs;     // timestamp changed

      if (!needsUpdate) continue;

      try {
        // Use the numeric DDF ListingKey for GetObject — MLS numbers cause 20402
        const listingKey = listingKeyByMls.get(mls) ?? row.id ?? mls;
        const urls = await photoSession.fetchPhotoUrls(listingKey);
        if (urls.length > 0) {
          await patchListingImages(mls, urls);
          console.log(`[photo] ${mls}: ${urls.length} photo(s) saved`);
        } else {
          console.log(`[photo] ${mls}: GetObject returned 0 URLs`);
        }
      } catch (e: any) {
        console.warn(`[photo] ${mls}: ${e.message}`);
      }
    }
  }

  return { successCount, failCount };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const ddfLastUpdated = process.env.DDF_LAST_UPDATED || '2026-04-20T00:00:00Z';
const DDF_SEARCH_LIMIT = 100;
const DDF_SEARCH_START_OFFSET = 1;
const DDF_SEARCH_FORMAT = 'COMPACT';
const DDF_MAX_PAGE_ATTEMPTS = 100;

function normalizeTimestamp(value: any): string | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toDotNetTicks(value: any): string | null {
  if (!value) return null;

  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;

  // BigInt arithmetic prevents float precision loss on 18-digit .NET tick values.
  // date.getTime() is ms since Unix epoch (~1.8e12 for 2026) — safely within
  // Number.MAX_SAFE_INTEGER, so BigInt(date.getTime()) is exact.
  const ticks = 621355968000000000n + BigInt(date.getTime()) * 10000n;
  return String(ticks);
}

function getRecordModificationTimestamp(item: DdfRaw): string | null {
  return normalizeTimestamp(item.ModificationTimestamp ?? item.LastUpdated ?? item.updated_at);
}


async function fetchDdfListings(): Promise<DdfRaw[]> {
  const loginUrl = process.env.DDF_LOGIN_URL;
  const username = process.env.DDF_USERNAME;
  const password = process.env.DDF_PASSWORD;

  if (!loginUrl || !username || !password) {
    throw new Error('Missing one or more DDF env vars: DDF_LOGIN_URL, DDF_USERNAME, DDF_PASSWORD');
  }

  console.log(`DDF last updated filter: ${ddfLastUpdated}`);
  console.log(`DDF search limit: ${DDF_SEARCH_LIMIT}`);

  return await (getAutoLogoutClient as any)(
    {
      loginUrl,
      username,
      password,
      version: 'RETS/1.7.2',
      userAgent: 'Tourit DDF Sync',
      userAgentPassword: '',
    },
    async (retsClient: any) => {
      const listings: DdfRaw[] = [];
      const supabase = createSupabaseClient();
      const latestModificationRef = { value: ddfLastUpdated };

      // Create one photo session for the whole sync — login once, reuse nonce
      let photoSession: DdfPhotoSession | null = null;
      try {
        photoSession = new DdfPhotoSession(loginUrl, username, password);
        await photoSession.login();
      } catch (e: any) {
        console.warn(`[photo] Could not establish photo session: ${e.message} — photos will be skipped`);
        photoSession = null;
      }

      let offset = DDF_SEARCH_START_OFFSET;
      let page = 1;
      let totalRecords: number | null = null;
      let keepGoing = true;

      while (keepGoing && page <= DDF_MAX_PAGE_ATTEMPTS) {
        const query = `(LastUpdated=${ddfLastUpdated})`;
        console.log(`Processing Page ${page} (Offset: ${offset}). Total Records: ${totalRecords ?? 'unknown'}...`);
        console.log(`Trying DMQL query: ${query}`);

        try {
          const response = await retsClient.search.query(
            'Property',
            'Property',
            query,
            {
              limit: DDF_SEARCH_LIMIT,
              offset,
              count: 1,
              format: DDF_SEARCH_FORMAT,
              standardNames: 1,
            } as any
          );

          const pageResults = response.results ?? [];
          const recordsReturned = pageResults.length;
          totalRecords = typeof response.count === 'number' ? response.count : totalRecords;

          console.log(`DEBUG: fetchSearchResults returned ${pageResults.length} result(s) on Page ${page}`);
          if (page === 1 && pageResults.length > 0) {
            const sample = pageResults[0];
            console.log('AVAILABLE KEYS:', Object.keys(sample));
            const potentialUrls = Object.entries(sample).filter(
              ([, v]) => typeof v === 'string' && v.includes('http')
            );
            console.log('POTENTIAL URLS FOUND:', potentialUrls);

            const photosChangeTimestamp = sample.PhotosChangeTimestamp ?? sample.photosChangeTimestamp;
            const dotNetTicks = toDotNetTicks(photosChangeTimestamp);
            console.log('PHOTOS_CHANGE_TIMESTAMP:', photosChangeTimestamp ?? null);
            console.log('PHOTOS_CHANGE_TIMESTAMP_ISO:', normalizeTimestamp(photosChangeTimestamp));
            console.log('PHOTOS_CHANGE_TIMESTAMP_DOTNET_TICKS:', dotNetTicks);
            console.log('PHOTOS_CHANGE_TIMESTAMP_MATCHES_SAMPLE:', dotNetTicks === '639124508855930000');

            const rebMatches = Object.entries(sample).filter(([, v]) => {
              if (typeof v !== 'string') return false;
              return /reb\d+/i.test(v);
            });
            console.log('REB_PATTERN_MATCHES:', rebMatches);
          }
          await processPageListings(supabase, pageResults, page, latestModificationRef, photoSession);
          listings.push(...pageResults);
          console.log(`Processing Page ${page} (Offset: ${offset}) complete. Returned ${recordsReturned} record(s).`);

          const reachedEndByCount =
            typeof totalRecords === 'number' && totalRecords > 0
              ? offset + recordsReturned - 1 >= totalRecords
              : recordsReturned < DDF_SEARCH_LIMIT;

          keepGoing = recordsReturned === DDF_SEARCH_LIMIT && !reachedEndByCount;
        } catch (pageError: unknown) {
          const message = pageError instanceof Error ? pageError.message : String(pageError);
          console.error(`Page ${page} failed at offset ${offset}: ${message}`);
          keepGoing = true;
        }

        if (keepGoing) {
          offset += DDF_SEARCH_LIMIT;
          page += 1;
          await sleep(2000);
        }
      }

      if (page > DDF_MAX_PAGE_ATTEMPTS) {
        console.warn(`Stopped after ${DDF_MAX_PAGE_ATTEMPTS} page attempt(s) to avoid an infinite loop.`);
      }

      (listings as any).latestModification = latestModificationRef.value;
      return listings;
    }
  );
}

async function syncListings() {
  let latestModification = ddfLastUpdated;
  try {
    const listings = await fetchDdfListings();
    latestModification = (listings as any).latestModification ?? ddfLastUpdated;

    if (!listings.length) {
      console.log('No DDF listings returned.');
      return;
    }

    console.log(`Received ${listings.length} listing(s) from DDF.`);

    console.log(`Synced ${listings.length} listing(s).`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('DDF sync failed:', message);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    throw error;
  } finally {
    console.log('\n--- SYNC COMPLETE ---');
    console.log('To fetch only new listings next time, update your .env.local with:');
    console.log('DDF_LAST_UPDATED=' + latestModification);
  }
}

if (require.main === module) {
  syncListings().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error('DDF sync failed (unhandled):', message);
    process.exitCode = 1;
  });
}

export { syncListings };
