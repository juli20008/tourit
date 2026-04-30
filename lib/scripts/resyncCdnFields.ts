/**
 * One-shot script: re-fetch external_id / photos_timestamp / photos_count
 * for every DDF listing and write them to mls_listings.
 *
 * Use this to recover from corrupted CDN metadata caused by the Repliers
 * edge function having previously overwritten these fields with null.
 *
 * Run with:
 *   npx ts-node lib/scripts/resyncCdnFields.ts
 *
 * To resync all rows regardless of modification date, set:
 *   DDF_LAST_UPDATED=2000-01-01T00:00:00Z
 * in .env.local before running.
 *
 * Env vars required: DDF_LOGIN_URL, DDF_USERNAME, DDF_PASSWORD,
 *                    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import '../env';
import { getAutoLogoutClient } from 'rets-client';
import { mapDDFToSupabase } from '../adapters/ListingAdapter';

const SEARCH_LIMIT = 100;
const SLEEP_MS = 1500;

// Pull back to 2000 to catch every listing in the DB
const SINCE = process.env.DDF_CDN_SINCE ?? '2000-01-01T00:00:00Z';

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function toDotNetTicks(value: any): string | null {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  // BigInt avoids float64 precision loss on 18-digit .NET tick values.
  const ticks = 621355968000000000n + BigInt(date.getTime()) * 10000n;
  return String(ticks);
}

async function upsertCdnBatch(
  url: string,
  key: string,
  rows: { mls_number: string; external_id: string | null; photos_timestamp: string | null; photos_count: number | null }[]
): Promise<void> {
  if (!rows.length) return;

  const endpoint = `${url}/rest/v1/mls_listings?on_conflict=mls_number`;
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      // Only update the three CDN columns — leave all other columns untouched
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Supabase upsert failed ${resp.status}: ${text}`);
  }
}

async function main() {
  const loginUrl  = process.env.DDF_LOGIN_URL;
  const username  = process.env.DDF_USERNAME;
  const password  = process.env.DDF_PASSWORD;
  const supaUrl   = process.env.SUPABASE_URL;
  const supaKey   = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!loginUrl || !username || !password || !supaUrl || !supaKey) {
    throw new Error(
      'Missing env vars: DDF_LOGIN_URL, DDF_USERNAME, DDF_PASSWORD, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY'
    );
  }

  console.log(`[resync-cdn] Fetching DDF listings modified since ${SINCE}...`);

  let totalUpdated = 0;

  await (getAutoLogoutClient as any)(
    { loginUrl, username, password, version: 'RETS/1.7.2', userAgent: 'Tourit CDN Resync' },
    async (rets: any) => {
      let offset = 1;
      let page   = 1;
      let totalRecords: number | null = null;
      let keepGoing = true;

      while (keepGoing) {
        console.log(`[resync-cdn] page ${page} (offset ${offset})...`);

        const query  = `(LastUpdated=${SINCE})`;
        const result = await rets.search.query('Property', 'Property', query, {
          limit: SEARCH_LIMIT,
          offset,
          count: 1,
          format: 'COMPACT',
          standardNames: 0,
        } as any);

        const items: any[] = result.results ?? [];
        if (typeof result.count === 'number') totalRecords = result.count;

        const rows = items
          .map((raw) => {
            const mapped = mapDDFToSupabase(raw);
            if (!mapped.mls_number) return null;
            return {
              mls_number:       String(mapped.mls_number),
              external_id:      mapped.external_id ?? null,
              photos_timestamp: mapped.photos_timestamp ?? null,
              photos_count:     typeof mapped.photos_count === 'number' ? mapped.photos_count : null,
            };
          })
          .filter((r): r is NonNullable<typeof r> => r !== null);

        await upsertCdnBatch(supaUrl, supaKey, rows);
        totalUpdated += rows.length;
        console.log(`[resync-cdn] page ${page}: ${rows.length} updated (total: ${totalUpdated})`);

        const reached = totalRecords != null
          ? offset + items.length - 1 >= totalRecords
          : items.length < SEARCH_LIMIT;
        keepGoing = items.length === SEARCH_LIMIT && !reached;

        if (keepGoing) {
          offset += SEARCH_LIMIT;
          page++;
          await sleep(SLEEP_MS);
        }
      }
    }
  );

  console.log(`\n[resync-cdn] Done — ${totalUpdated} DDF rows refreshed.`);
}

main().catch((err) => {
  console.error('[resync-cdn] FAILED:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
