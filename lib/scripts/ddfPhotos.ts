/**
 * Fetches photo URLs directly from DDF via RETS GetObject (Location=1 mode).
 * Location=1 tells the RETS server to return CDN URLs instead of binary data,
 * so we get the real Realtor.ca TS-coded URLs without any math.
 *
 * Run with:
 *   npx ts-node lib/scripts/ddfPhotos.ts
 *
 * Required env vars (in .env.local):
 *   DDF_LOGIN_URL, DDF_USERNAME, DDF_PASSWORD
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import '../env';
import { getAutoLogoutClient } from 'rets-client';

// Extract the 18-digit TS code from a Realtor.ca CDN URL.
// Example URL: https://cdn.realtor.ca/listings/TS639122837740030000/reb82/highres/4/22067286_1.jpg
// Extracted  : 639122837740030000
const TS_RE = /\/TS(\d{15,19})\//;

function extractTsCode(url: string): string | null {
  const m = url.match(TS_RE);
  return m ? m[1] : null;
}

async function supabaseInsert(supaUrl: string, supaKey: string, row: Record<string, unknown>) {
  const res = await fetch(`${supaUrl}/rest/v1/ddf_photos`, {
    method: 'POST',
    headers: {
      apikey: supaKey,
      Authorization: `Bearer ${supaKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`Supabase insert failed ${res.status}: ${await res.text()}`);
}

async function main() {
  const loginUrl = process.env.DDF_LOGIN_URL;
  const username  = process.env.DDF_USERNAME;
  const password  = process.env.DDF_PASSWORD;
  const supaUrl   = process.env.SUPABASE_URL;
  const supaKey   = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!loginUrl || !username || !password || !supaUrl || !supaKey) {
    throw new Error(
      'Missing env: DDF_LOGIN_URL, DDF_USERNAME, DDF_PASSWORD, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY'
    );
  }

  await (getAutoLogoutClient as any)(
    { loginUrl, username, password, version: 'RETS/1.7.2', userAgent: 'Tourit-Photos/1.0' },
    async (rets: any) => {

      // ── Step 1: grab one listing so we have a real MLS number ──────────────
      console.log('[ddf-photos] Searching for a sample listing…');
      const searchResult = await rets.search.query(
        'Property', 'Property',
        '(LastUpdated=2020-01-01T00:00:00Z)',
        { limit: 1, offset: 1, count: 0, format: 'COMPACT', standardNames: 1 }
      );

      const listing = searchResult.results?.[0];
      if (!listing) throw new Error('DDF returned no listings');

      // MLS number lives in different fields depending on the board
      const mlsNumber = String(
        listing.ListingKey ?? listing.ListingId ?? listing.MlsNumber ?? listing.MLS_NUM ?? ''
      );
      console.log(`[ddf-photos] Using MLS number: ${mlsNumber}`);

      // ── Step 2: GetObject with Location=1 → returns URLs, not binaries ─────
      // '*' means all photos for this listing.
      // alwaysGroupObjects ensures the result is always an array.
      console.log('[ddf-photos] Requesting photo URLs via GetObject Location=1…');
      const objectResult = await rets.objects.getAllObjects(
        'Property',   // resource
        'HiRes',      // object type — try 'Photo' if this returns nothing
        `${mlsNumber}:*`,
        {
          alwaysGroupObjects: true,
          Location: 1,   // ← key flag: return URLs instead of binary
        }
      );

      // rets-client puts the URL in headerInfo.location (or contentLocation)
      const photoUrls: string[] = [];
      for (const obj of objectResult ?? []) {
        const url =
          obj?.headerInfo?.location ??
          obj?.contentLocation ??
          obj?.location ??
          null;
        if (url && typeof url === 'string' && url.startsWith('http')) {
          photoUrls.push(url);
        }
      }

      // If HiRes returned nothing, fall back to standard Photo type
      if (!photoUrls.length) {
        console.log('[ddf-photos] HiRes returned no URLs, retrying with Photo type…');
        const fallback = await rets.objects.getAllObjects(
          'Property', 'Photo', `${mlsNumber}:*`,
          { alwaysGroupObjects: true, Location: 1 }
        );
        for (const obj of fallback ?? []) {
          const url =
            obj?.headerInfo?.location ??
            obj?.contentLocation ??
            obj?.location ??
            null;
          if (url && typeof url === 'string' && url.startsWith('http')) {
            photoUrls.push(url);
          }
        }
      }

      console.log(`[ddf-photos] Got ${photoUrls.length} photo URL(s)`);

      // ── Step 3: extract TS code ────────────────────────────────────────────
      const firstUrl = photoUrls[0] ?? null;
      const imageVersion = firstUrl ? extractTsCode(firstUrl) : null;

      console.log('\n=== Photo URLs ===');
      photoUrls.forEach((u, i) => console.log(`  [${i + 1}] ${u}`));
      console.log(`\n  TS code extracted: ${imageVersion ?? '(not found)'}`);

      if (!imageVersion) {
        console.warn(
          '\n  ⚠  No TS code found. The DDF server may not support Location=1,' +
          '\n     or the object type is different. Check the raw URLs above.'
        );
      }

      // ── Step 4: store in Supabase ─────────────────────────────────────────
      if (photoUrls.length || mlsNumber) {
        await supabaseInsert(supaUrl, supaKey, {
          mls_number:    mlsNumber || null,
          photo_urls:    photoUrls,
          image_version: imageVersion,
        });
        console.log('\n[ddf-photos] Saved to ddf_photos table ✓');
        console.log("  SELECT * FROM ddf_photos ORDER BY fetched_at DESC LIMIT 1;");
      }
    }
  );
}

main().catch(err => {
  console.error('[ddf-photos] FAILED:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
