/**
 * Diagnostic: why do some listings get 0 photos from DDF GetObject?
 * Samples 5 listings WITH photos and 5 WITHOUT, calls GetObject for each,
 * and dumps the full RETS response to show what's different.
 *
 * Run: npx ts-node lib/scripts/diagPhotos.ts
 */

import dotenv from 'dotenv';
import { getAutoLogoutClient } from 'rets-client';
import { DdfPhotoSession } from '../services/ddfPhotoFetcher';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function fetchSamples() {
  // 5 listings that currently HAVE images (good)
  const r1 = await fetch(
    `${SUPABASE_URL}/rest/v1/mls_listings?images=not.is.null&select=mls_number,board_id,status,list_date,photos_count,photos_timestamp&limit=5`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  const good: any[] = await r1.json();

  // 5 listings that have photos_timestamp but NO images (bad)
  const r2 = await fetch(
    `${SUPABASE_URL}/rest/v1/mls_listings?images=is.null&photos_timestamp=not.is.null&select=mls_number,board_id,status,list_date,photos_count,photos_timestamp&limit=5`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  const bad: any[] = await r2.json();

  return { good, bad };
}

async function main() {
  const loginUrl = process.env.DDF_LOGIN_URL!;
  const username  = process.env.DDF_USERNAME!;
  const password  = process.env.DDF_PASSWORD!;

  const { good, bad } = await fetchSamples();
  console.log('\n=== GOOD (have images) ===');
  for (const r of good) console.log(` ${r.mls_number} | board=${r.board_id} | status=${r.status} | photos_count=${r.photos_count}`);
  console.log('\n=== BAD (no images, have timestamp) ===');
  for (const r of bad) console.log(` ${r.mls_number} | board=${r.board_id} | status=${r.status} | photos_count=${r.photos_count}`);

  // Build a lookup: mls_number → Supabase row
  const allMls = [...good.map(r => r.mls_number), ...bad.map(r => r.mls_number)];

  // Find DDF ListingKey for each via DDF Search
  const mlsToKey = new Map<string, string>();
  console.log('\n=== Scanning DDF to find ListingKeys ===');

  await (getAutoLogoutClient as any)(
    { loginUrl, username, password, version: 'RETS/1.7.2', userAgent: 'Tourit-Diag/1.0' },
    async (rets: any) => {
      let offset = 1;
      while (mlsToKey.size < allMls.length) {
        const result = await rets.search.query(
          'Property', 'Property',
          '(LastUpdated=2023-01-01T00:00:00Z)',
          { limit: 500, offset, format: 'COMPACT', standardNames: 1 } as any
        );
        const items = result.results ?? [];
        if (!items.length) break;

        for (const item of items) {
          const mls = String(item.ListingId ?? item.ListingID ?? item.ListingKey ?? '');
          if (allMls.includes(mls)) {
            mlsToKey.set(mls, item.ListingKey ?? mls);
            console.log(`  Found ${mls} → ListingKey=${item.ListingKey ?? '(none)'} | PhotosChangeTimestamp=${item.PhotosChangeTimestamp ?? '?'}`);
          }
        }
        if (items.length < 500) break;
        offset += 500;
        if (offset > 50000) { console.log('  (gave up after 50k DDF listings)'); break; }
      }
    }
  );

  // Now call GetObject for each and show what DDF returns
  const photoSession = new DdfPhotoSession(loginUrl, username, password);
  await photoSession.login();

  console.log('\n=== GetObject results ===');
  for (const { label, rows } of [{ label: 'GOOD', rows: good }, { label: 'BAD', rows: bad }]) {
    console.log(`\n--- ${label} ---`);
    for (const row of rows) {
      const key = mlsToKey.get(row.mls_number) ?? row.mls_number;
      console.log(`\n${row.mls_number} (board=${row.board_id} status=${row.status} photos_count=${row.photos_count})`);
      console.log(`  ListingKey used for GetObject: ${key}`);
      try {
        const urls = await photoSession.fetchPhotoUrls(key);
        console.log(`  → ${urls.length} photo URL(s) returned`);
        if (urls.length) console.log(`     first: ${urls[0].slice(0, 100)}`);
      } catch (e: any) {
        console.log(`  → ERROR: ${e.message}`);
      }
      await new Promise(r => setTimeout(r, 500));
    }
  }
}

main().catch(e => {
  console.error('FATAL:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
