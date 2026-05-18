/**
 * Probes the Repliers API to show the raw `details` fields for a few listings,
 * specifically to confirm numBedrooms, numBedroomsPlus, and any level-specific counts.
 *
 * Run:  npx ts-node lib/scripts/probeRepliers.ts
 */

import '../env';

const BASE = 'https://csr-api.repliers.io';

async function main() {
  const apiKey = process.env.REPLIERS_API_KEY;
  if (!apiKey) throw new Error('Missing REPLIERS_API_KEY in env');

  const res = await fetch(`${BASE}/listings?pageNum=1&resultsPerPage=20`, {
    headers: { 'REPLIERS-API-KEY': apiKey },
  });

  if (!res.ok) throw new Error(`Repliers ${res.status}: ${await res.text()}`);

  const data: any = await res.json();
  const listings: any[] = data.listings ?? [];
  console.log(`Fetched ${listings.length} listings.\n`);

  // Show all detail keys that exist across the batch
  const allDetailKeys = new Set<string>();
  for (const l of listings) {
    for (const k of Object.keys(l.details ?? {})) allDetailKeys.add(k);
  }
  console.log('=== All keys in details object ===');
  console.log([...allDetailKeys].sort().join('\n'));

  // Show bedroom-relevant fields for each listing
  console.log('\n=== Bedroom fields per listing ===');
  const BED_KEYS = ['numBedrooms', 'numBedroomsPlus', 'numRooms', 'numBeds',
                    'bedroomsAboveGrade', 'bedroomsBelowGrade', 'aboveGrade', 'belowGrade'];

  for (const l of listings.slice(0, 10)) {
    const det = l.details ?? {};
    const addr = l.address ?? {};
    const mls = l.mlsNumber ?? '?';
    const city = addr.city ?? '?';
    const unit = addr.unitNumber ?? '';
    const label = unit ? `${mls} (${city}, unit ${unit})` : `${mls} (${city})`;

    const bedFields = BED_KEYS
      .filter(k => det[k] !== undefined && det[k] !== null && det[k] !== '')
      .map(k => `${k}=${det[k]}`);

    console.log(`  ${label}: ${bedFields.join(', ') || '(no bedroom detail fields)'}`);
  }
}

main().catch(err => {
  console.error('FAILED:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
