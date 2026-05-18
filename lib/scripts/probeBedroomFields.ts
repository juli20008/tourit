/**
 * Probes DDF Standard-XML format to find BedroomsAboveGround / BedroomsBelowGround.
 *
 * DDF Compact format only has BedroomsTotal.
 * Standard-XML nests them under PropertyDetails.Building per the DDF documentation.
 *
 * Run:  npx ts-node lib/scripts/probeBedroomFields.ts
 * Optional: npx ts-node lib/scripts/probeBedroomFields.ts --mls=W12345678
 */

import '../env';
import { getAutoLogoutClient } from 'rets-client';

const BEDROOM_KEYS = [
  'BedroomsAboveGround', 'BedroomsAboveGrade', 'AboveGradeBedrooms',
  'BedroomsBelowGround', 'BedroomsBelowGrade', 'BelowGradeBedrooms',
  'BedroomsTotal', 'Bedrooms',
];

function findBedFields(node: unknown, path = ''): Array<{ path: string; value: unknown }> {
  if (!node || typeof node !== 'object') return [];
  const hits: Array<{ path: string; value: unknown }> = [];
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    const fullPath = path ? `${path}.${k}` : k;
    const keyUpper = k.toUpperCase();
    if (BEDROOM_KEYS.some(bk => bk.toUpperCase() === keyUpper)) {
      hits.push({ path: fullPath, value: v });
    }
    if (v && typeof v === 'object') hits.push(...findBedFields(v, fullPath));
  }
  return hits;
}

async function main() {
  const loginUrl = process.env.DDF_LOGIN_URL!;
  const username  = process.env.DDF_USERNAME!;
  const password  = process.env.DDF_PASSWORD!;

  if (!loginUrl || !username || !password) throw new Error('Missing DDF env vars');

  const mlsArg = process.argv.find(a => a.startsWith('--mls='))?.split('=')[1];

  await (getAutoLogoutClient as any)(
    { loginUrl, username, password, version: 'RETS/1.7.2', userAgent: 'Tourit-Probe/1.0' },
    async (rets: any) => {

      // ── 1. COMPACT with standardNames (current format) ───────────────────────
      console.log('\n=== COMPACT + standardNames (current sync format) ===');
      const compactResult = await rets.search.query(
        'Property', 'Property',
        mlsArg ? `(ListingId=${mlsArg})` : '(LastUpdated=2020-01-01T00:00:00Z)',
        { limit: 1, offset: 1, count: 0, format: 'COMPACT', standardNames: 1 }
      );
      const compactItem = compactResult?.results?.[0];
      if (compactItem) {
        const hits = findBedFields(compactItem);
        if (hits.length) {
          console.log('Bedroom fields found in COMPACT:');
          for (const h of hits) console.log(`  ${h.path}: ${h.value}`);
        } else {
          console.log('No above-grade / below-grade bedroom fields in COMPACT.');
          console.log('BedroomsTotal:', compactItem.BedroomsTotal ?? compactItem.Bedrooms ?? '(missing)');
        }
      } else {
        console.log('No COMPACT results returned.');
      }

      // ── 2. STANDARD-XML ──────────────────────────────────────────────────────
      console.log('\n=== STANDARD-XML format ===');
      try {
        const xmlResult = await rets.search.query(
          'Property', 'Property',
          mlsArg ? `(ListingId=${mlsArg})` : '(LastUpdated=2020-01-01T00:00:00Z)',
          { limit: 1, offset: 1, count: 0, format: 'STANDARD-XML', standardNames: 1 }
        );
        const xmlItem = xmlResult?.results?.[0] ?? xmlResult?.result ?? xmlResult;
        if (xmlItem) {
          const hits = findBedFields(xmlItem);
          if (hits.length) {
            console.log('Bedroom fields found in STANDARD-XML:');
            for (const h of hits) console.log(`  ${h.path}: ${h.value}`);
          } else {
            console.log('No above-grade / below-grade bedroom fields in STANDARD-XML either.');
          }

          // Print the PropertyDetails.Building section if it exists
          const building =
            (xmlItem as any)?.PropertyDetails?.Building ??
            (xmlItem as any)?.Building ?? null;
          if (building) {
            console.log('\nPropertyDetails.Building section:');
            console.log(JSON.stringify(building, null, 2));
          } else {
            console.log('\nFull raw result (first 4000 chars):');
            console.log(JSON.stringify(xmlItem, null, 2).slice(0, 4000));
          }
        } else {
          console.log('No STANDARD-XML results returned.');
        }
      } catch (err: any) {
        console.error('STANDARD-XML query failed:', err?.message ?? err);
      }
    }
  );
}

main().catch(err => {
  console.error('FAILED:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
