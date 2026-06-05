/**
 * Direct PostgreSQL helpers — replaces Supabase REST API calls across all sync scripts.
 * Uses the `pg` package with a connection pool driven by DATABASE_URL.
 */
import { Pool, PoolClient } from 'pg';

let _pool: Pool | null = null;

export function getPool(): Pool {
  if (!_pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL env var is required');
    _pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 5 });
  }
  return _pool;
}

/** Upsert rows into mls_listings, conflict on mls_number. */
export async function upsertListings(rows: Record<string, any>[]): Promise<void> {
  if (!rows.length) return;
  const pool = getPool();

  // Build column list from first row
  const cols = Object.keys(rows[0]);
  const colsSql = cols.map(c => `"${c}"`).join(', ');
  const updateSql = cols
    .filter(c => c !== 'mls_number')
    .map(c => `"${c}" = EXCLUDED."${c}"`)
    .join(', ');

  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const values: any[] = [];
    const placeholders = batch.map((row, ri) => {
      const rowPlaceholders = cols.map((_, ci) => {
        values.push(row[cols[ci]] ?? null);
        return `$${ri * cols.length + ci + 1}`;
      });
      return `(${rowPlaceholders.join(', ')})`;
    });

    await pool.query(
      `INSERT INTO mls_listings (${colsSql}) VALUES ${placeholders.join(', ')}
       ON CONFLICT (mls_number) DO UPDATE SET ${updateSql}`,
      values
    );
  }
}

/** Update images array for a single listing. */
export async function patchImages(mlsNumber: string, urls: string[]): Promise<void> {
  await getPool().query(
    `UPDATE mls_listings SET images = $1 WHERE mls_number = $2`,
    [JSON.stringify(urls), mlsNumber]
  );
}

/** Update photos_timestamp for a single listing. */
export async function patchPhotosTimestamp(mlsNumber: string, ts: string): Promise<void> {
  await getPool().query(
    `UPDATE mls_listings SET photos_timestamp = $1 WHERE mls_number = $2`,
    [ts, mlsNumber]
  );
}

/** Fetch photos_timestamp for a batch of mls_numbers. */
export async function fetchExistingTimestamps(
  mlsNumbers: string[]
): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  if (!mlsNumbers.length) return map;
  const placeholders = mlsNumbers.map((_, i) => `$${i + 1}`).join(', ');
  const res = await getPool().query(
    `SELECT mls_number, photos_timestamp FROM mls_listings WHERE mls_number IN (${placeholders})`,
    mlsNumbers
  );
  for (const row of res.rows) map.set(row.mls_number, row.photos_timestamp ?? null);
  return map;
}

/** Fetch mls_number + photos_timestamp + images for a batch (for ddfSync photo check). */
export async function fetchListingPhotoInfo(
  mlsNumbers: string[]
): Promise<Array<{ mls_number: string; photos_timestamp: string | null; images: string[] }>> {
  if (!mlsNumbers.length) return [];
  const placeholders = mlsNumbers.map((_, i) => `$${i + 1}`).join(', ');
  const res = await getPool().query(
    `SELECT mls_number, photos_timestamp, images FROM mls_listings WHERE mls_number IN (${placeholders})`,
    mlsNumbers
  );
  return res.rows.map(r => ({
    mls_number: r.mls_number,
    photos_timestamp: r.photos_timestamp ?? null,
    images: r.images ?? [],
  }));
}

/** Fetch a single listing by mls_number. */
export async function fetchListing(
  mlsNumber: string
): Promise<Record<string, any> | null> {
  const res = await getPool().query(
    `SELECT * FROM mls_listings WHERE mls_number = $1`,
    [mlsNumber]
  );
  return res.rows[0] ?? null;
}

/** Fetch all active mls_numbers (for deactivateStale). */
export async function fetchActiveMlsNumbers(): Promise<Set<string>> {
  const res = await getPool().query(
    `SELECT mls_number FROM mls_listings WHERE status != 'Inactive'`
  );
  return new Set(res.rows.map(r => r.mls_number));
}

/** Mark a listing inactive. */
export async function deactivateListing(mlsNumber: string): Promise<void> {
  await getPool().query(
    `UPDATE mls_listings SET status = 'Inactive', standard_status = 'Inactive' WHERE mls_number = $1`,
    [mlsNumber]
  );
}

/** Fetch listings with null lat/lng for geocoding. */
export async function fetchListingsNeedingGeocode(
  limit = 200
): Promise<Array<{ mls_number: string; street_number: string; street_name: string; street_suffix: string; city: string; state: string; zip: string }>> {
  const res = await getPool().query(
    `SELECT mls_number, street_number, street_name, street_suffix, city, state, zip
     FROM mls_listings WHERE lat IS NULL AND status != 'Inactive' LIMIT $1`,
    [limit]
  );
  return res.rows;
}

/** Update lat/lng for a listing. */
export async function patchGeocode(mlsNumber: string, lat: number, lng: number): Promise<void> {
  await getPool().query(
    `UPDATE mls_listings SET lat = $1, lng = $2 WHERE mls_number = $3`,
    [lat, lng, mlsNumber]
  );
}

/** Fetch listings with empty images for backfill. */
export async function fetchListingsNeedingImages(
  limit = 500
): Promise<Array<{ mls_number: string; photos_count: number }>> {
  const res = await getPool().query(
    `SELECT mls_number, photos_count FROM mls_listings
     WHERE (images IS NULL OR images = '[]' OR images = 'null')
       AND photos_count > 0 AND status != 'Inactive'
     LIMIT $1`,
    [limit]
  );
  return res.rows;
}

/** Generic patch — update arbitrary columns for a listing. */
export async function patchListing(
  mlsNumber: string,
  data: Record<string, any>
): Promise<void> {
  const entries = Object.entries(data);
  if (!entries.length) return;
  const setClauses = entries.map(([k], i) => `"${k}" = $${i + 1}`).join(', ');
  const values = entries.map(([, v]) => v);
  values.push(mlsNumber);
  await getPool().query(
    `UPDATE mls_listings SET ${setClauses} WHERE mls_number = $${values.length}`,
    values
  );
}

/**
 * createDbClient() — drop-in replacement for the Supabase JS client used in ddfSync.ts.
 * Supports: from(table).upsert(rows, {onConflict}) and from(table).select(cols).eq(col,val).maybeSingle()
 */
export function createDbClient() {
  return {
    from(table: string) {
      return {
        select(columns: string) {
          return {
            eq(column: string, value: string) {
              return {
                async maybeSingle() {
                  try {
                    const cols = columns === '*' ? '*' : columns.split(',').map(c => `"${c.trim()}"`).join(', ');
                    const res = await getPool().query(
                      `SELECT ${cols} FROM "${table}" WHERE "${column}" = $1 LIMIT 1`,
                      [value]
                    );
                    return { data: res.rows[0] ?? null, error: null };
                  } catch (e: any) {
                    return { data: null, error: e };
                  }
                },
              };
            },
          };
        },
        async upsert(rows: Record<string, any> | Record<string, any>[], options?: { onConflict?: string }) {
          try {
            const payload = Array.isArray(rows) ? rows : [rows];
            if (!payload.length) return { data: [], error: null };
            const conflictCol = options?.onConflict ?? 'mls_number';
            const cols = Object.keys(payload[0]);
            const colsSql = cols.map(c => `"${c}"`).join(', ');
            const updateSql = cols
              .filter(c => c !== conflictCol)
              .map(c => `"${c}" = EXCLUDED."${c}"`)
              .join(', ');

            const BATCH = 500;
            for (let i = 0; i < payload.length; i += BATCH) {
              const batch = payload.slice(i, i + BATCH);
              const values: any[] = [];
              const placeholders = batch.map((row, ri) => {
                const rowPlaceholders = cols.map((_, ci) => {
                  values.push(row[cols[ci]] ?? null);
                  return `$${ri * cols.length + ci + 1}`;
                });
                return `(${rowPlaceholders.join(', ')})`;
              });
              await getPool().query(
                `INSERT INTO "${table}" (${colsSql}) VALUES ${placeholders.join(', ')}
                 ON CONFLICT ("${conflictCol}") DO UPDATE SET ${updateSql}`,
                values
              );
            }
            return { data: payload, error: null };
          } catch (e: any) {
            return { data: null, error: e };
          }
        },
      };
    },
  };
}
