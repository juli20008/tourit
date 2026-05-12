/**
 * Geocode listings with null lat/lng using OpenStreetMap Nominatim (free).
 *
 * Rate limit: 1 request/second max per Nominatim policy.
 * ~9,800 listings ≈ 3 hours — fits in one GitHub Actions run.
 *
 * Run:
 *   npx ts-node lib/scripts/geocodeListings.ts
 *   npx ts-node lib/scripts/geocodeListings.ts --state=Ontario --limit=500
 */

import dotenv from 'dotenv';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getArg(name: string): string | null {
  const a = process.argv.find(x => x.startsWith(`--${name}=`));
  return a ? a.split('=').slice(1).join('=') : null;
}

const STATE      = getArg('state') ?? 'Ontario';
const LIMIT      = parseInt(getArg('limit') ?? '99999', 10);
const DELAY_MS   = 1100; // Nominatim: max 1 req/sec
const CITIES_ARG = getArg('cities');
const CITY_FILTER: string[] = CITIES_ARG
  ? CITIES_ARG.split(',').map(c => c.trim()).filter(Boolean)
  : [];

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ─── Supabase ─────────────────────────────────────────────────────────────────

interface Listing {
  mls_number: string;
  street_number: string | null;
  street_name: string | null;
  street_suffix: string | null;
  city: string | null;
  zip: string | null;
}

async function fetchNullGeoListings(): Promise<Listing[]> {
  const all: Listing[] = [];
  let offset = 0;
  const pageSize = 1000;

  const cityParam = CITY_FILTER.length
    ? `&city=in.(${CITY_FILTER.map(c => encodeURIComponent(c)).join(',')})` : '';
  if (CITY_FILTER.length) console.log(`[geocode] City filter: ${CITY_FILTER.join(', ')}`);

  while (true) {
    const url = `${SUPABASE_URL}/rest/v1/mls_listings` +
      `?select=mls_number,street_number,street_name,street_suffix,city,zip` +
      `&state=eq.${encodeURIComponent(STATE)}` +
      `&lat=is.null` +
      cityParam +
      `&limit=${pageSize}&offset=${offset}`;

    const res = await fetch(url, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Supabase fetch failed: ${res.status}`);
    const rows: Listing[] = await res.json();
    all.push(...rows);
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

async function patchGeo(mlsNumber: string, lat: number, lng: number): Promise<void> {
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
      body: JSON.stringify({ lat, lng }),
    }
  );
  if (!res.ok) throw new Error(`PATCH failed ${res.status}: ${await res.text()}`);
}

// ─── Nominatim geocoder ───────────────────────────────────────────────────────

async function geocode(listing: Listing): Promise<{ lat: number; lng: number } | null> {
  const street = [listing.street_number, listing.street_name, listing.street_suffix]
    .filter(Boolean).join(' ');

  if (!street || !listing.city) return null;

  const params = new URLSearchParams({
    street,
    city:        listing.city,
    country:     'Canada',
    format:      'json',
    limit:       '1',
    addressdetails: '0',
  });
  if (listing.zip) params.set('postalcode', listing.zip);

  const url = `https://nominatim.openstreetmap.org/search?${params}`;

  const res = await fetch(url, {
    headers: {
      // Nominatim requires a descriptive User-Agent with contact info
      'User-Agent': 'Tourit/1.0 (mialitoronto@gmail.com)',
      'Accept-Language': 'en',
    },
  });

  if (!res.ok) {
    throw new Error(`Nominatim HTTP ${res.status}`);
  }

  const data: any[] = await res.json();
  if (!data.length) return null;

  const lat = parseFloat(data[0].lat);
  const lng = parseFloat(data[0].lon);
  if (!isFinite(lat) || !isFinite(lng)) return null;

  return { lat, lng };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');

  console.log(`[geocode] Loading ${STATE} listings with null lat…`);
  const listings = await fetchNullGeoListings();
  const toProcess = listings.slice(0, LIMIT);
  console.log(`[geocode] ${listings.length} need geocoding, processing ${toProcess.length} (${DELAY_MS}ms between calls)`);

  if (!toProcess.length) { console.log('[geocode] Nothing to do.'); return; }

  let ok = 0, notFound = 0, failed = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const listing = toProcess[i];

    if (i > 0) await sleep(DELAY_MS);

    if (i % 100 === 0) {
      console.log(`[geocode] ${i}/${toProcess.length} — ok=${ok} notFound=${notFound} failed=${failed}`);
    }

    try {
      const coords = await geocode(listing);
      if (coords) {
        await patchGeo(listing.mls_number, coords.lat, coords.lng);
        ok++;
      } else {
        notFound++;
        if (notFound <= 10) {
          const addr = [listing.street_number, listing.street_name, listing.street_suffix, listing.city].filter(Boolean).join(' ');
          console.log(`  ○ not found: ${listing.mls_number} — ${addr}`);
        }
      }
    } catch (e: any) {
      failed++;
      console.warn(`  ✗ ${listing.mls_number}: ${e.message}`);
    }
  }

  console.log(`\n[geocode] === DONE ===`);
  console.log(`  Geocoded:  ${ok}`);
  console.log(`  Not found: ${notFound}`);
  console.log(`  Errors:    ${failed}`);
}

main().catch(e => {
  console.error('[geocode] FATAL:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
