/**
 * Finds one Toronto listing via DDF Search, then fetches its photo URLs
 * via GetObject (COMPACT XML) using DdfPhotoSession.
 *
 * Run with:
 *   npx ts-node lib/scripts/testTorontoPhotos.ts
 */

import '../env';
import { getAutoLogoutClient } from 'rets-client';
import { DdfPhotoSession } from '../services/ddfPhotoFetcher';

async function main() {
  const loginUrl = process.env.DDF_LOGIN_URL!;
  const username  = process.env.DDF_USERNAME!;
  const password  = process.env.DDF_PASSWORD!;

  if (!loginUrl || !username || !password) {
    throw new Error('Missing DDF_LOGIN_URL, DDF_USERNAME, DDF_PASSWORD');
  }

  // ── Step 1: find a Toronto listing and grab its ListingKey ────────────────
  console.log('\n[search] Looking for a Toronto listing with photos…');

  const listing = await (getAutoLogoutClient as any)(
    { loginUrl, username, password, version: 'RETS/1.7.2', userAgent: 'Tourit-Test/1.0' },
    async (rets: any) => {
      // Use the same working query as the main sync; fetch enough to find a Toronto/Ontario listing
      const result = await rets.search.query(
        'Property', 'Property',
        '(LastUpdated=2026-01-01T00:00:00Z)',
        { limit: 50, offset: 1, count: 0, format: 'COMPACT', standardNames: 1 }
      );
      const rows: any[] = result.results ?? [];
      console.log(`[search] Got ${rows.length} listings, scanning for Toronto/Ontario…`);

      // Prefer Toronto, fall back to any Ontario listing
      const toronto  = rows.find(r => String(r.City ?? '').toLowerCase().includes('toronto'));
      const ontario  = rows.find(r => String(r.StateOrProvince ?? '').toLowerCase().includes('ontario'));
      const best     = toronto ?? ontario ?? rows[0] ?? null;
      if (best) console.log(`[search] Cities found: ${[...new Set(rows.map(r => r.City).filter(Boolean))].join(', ')}`);
      return best;
    }
  );

  if (!listing) {
    console.error('[search] No Toronto listing found.');
    return;
  }

  const listingKey = listing.ListingKey ?? listing.ListingID;
  const mlsNum     = listing.ListingId ?? listing.MlsNumber ?? listing.ListingKey;
  console.log(`[search] Found: ListingKey=${listingKey}  MLS=${mlsNum}  City=${listing.City}  Photos=${listing.PhotosCount}`);
  console.log(`[search] Address: ${listing.StreetNumber} ${listing.StreetName} ${listing.StreetSuffix}, ${listing.City}`);

  // ── Step 2: fetch photo URLs via GetObject ────────────────────────────────
  console.log('\n[photo] Starting DdfPhotoSession…');
  const session = new DdfPhotoSession(loginUrl, username, password);
  await session.login();

  const urls = await session.fetchPhotoUrls(listingKey);

  console.log(`\n[result] Got ${urls.length} photo URL(s) for listing ${listingKey}:`);
  urls.forEach((u, i) => console.log(`  [${i + 1}] ${u}`));

  if (urls.length === 0) {
    console.log('\n  No URLs returned — check the [photo] MediaUrl lines above for raw values.');
  }
}

main().catch(err => {
  console.error('FAILED:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
