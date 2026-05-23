/**
 * Probe a single DDF listing by MLS number and print all raw fields.
 * Scans from a recent date to minimise pages before the listing is found.
 *
 * Usage:
 *   npx ts-node lib/scripts/probeListing.ts --mls=N12956506
 *   npx ts-node lib/scripts/probeListing.ts --mls=N12956506 --since=2025-01-01
 */

import dotenv from 'dotenv';
import { getAutoLogoutClient } from 'rets-client';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

function getArg(name: string): string | null {
  const a = process.argv.find(x => x.startsWith(`--${name}=`));
  return a ? a.split('=').slice(1).join('=') : null;
}

const TARGET_MLS = getArg('mls');
if (!TARGET_MLS) {
  console.error('Usage: npx ts-node lib/scripts/probeListing.ts --mls=N12956506');
  process.exit(1);
}

const SINCE      = getArg('since') ?? '2025-01-01T00:00:00Z';
const START_PAGE = parseInt(getArg('start-page') ?? '1', 10);
const PAGE_SIZE  = 100;

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const loginUrl = process.env.DDF_LOGIN_URL!;
  const username  = process.env.DDF_USERNAME!;
  const password  = process.env.DDF_PASSWORD!;

  if (!loginUrl || !username || !password) {
    throw new Error('Missing DDF_LOGIN_URL / DDF_USERNAME / DDF_PASSWORD');
  }

  console.log(`[probe] Looking for MLS ${TARGET_MLS} (since ${SINCE})…`);

  await (getAutoLogoutClient as any)(
    { loginUrl, username, password, version: 'RETS/1.7.2', userAgent: 'Tourit-Probe/1.0' },
    async (rets: any) => {
      const dmql = `(LastUpdated=${SINCE})`;
      let offset = (START_PAGE - 1) * PAGE_SIZE + 1;
      let page   = START_PAGE;
      let found  = false;

      while (!found) {
        process.stdout.write(`\r[probe] Page ${page} (offset ${offset})…   `);

        let results: any[];
        try {
          const response = await rets.search.query(
            'Property', 'Property', dmql,
            { limit: PAGE_SIZE, offset, count: page === 1 ? 1 : 0, format: 'COMPACT', standardNames: 1 }
          );
          results = response.results ?? [];
          if (page === 1 && response.count) {
            console.log(`\n[probe] DDF total in range: ${response.count.toLocaleString()}`);
          }
        } catch (e: any) {
          console.error(`\n[probe] DDF error on page ${page}: ${e.message}`);
          break;
        }

        if (!results.length) {
          console.log('\n[probe] No more results — listing not found in this date range.');
          console.log(`Try a wider range: --since=2023-01-01`);
          break;
        }

        for (const item of results) {
          const mls = String(
            item.ListingId ?? item.ListingID ?? item.MLS_NUM ?? item.MlsNumber ?? item.ListingKey ?? ''
          );
          if (mls !== TARGET_MLS) continue;

          console.log(`\n\n[probe] ✓ Found ${TARGET_MLS}\n`);
          console.log('=== ALL RAW DDF FIELDS ===\n');

          // Print every field, sorted alphabetically
          const entries = Object.entries(item).sort(([a], [b]) => a.localeCompare(b));
          for (const [key, val] of entries) {
            if (val !== null && val !== undefined && val !== '') {
              console.log(`  ${key.padEnd(40)} ${JSON.stringify(val)}`);
            }
          }

          console.log('\n=== BEDROOM FIELDS SPECIFICALLY ===\n');
          const bedroomKeys = entries.filter(([k]) =>
            k.toLowerCase().includes('bed') ||
            k.toLowerCase().includes('room') ||
            k.toLowerCase().includes('basement') ||
            k.toLowerCase().includes('grade') ||
            k.toLowerCase().includes('floor') ||
            k.toLowerCase().includes('level')
          );
          if (bedroomKeys.length) {
            for (const [key, val] of bedroomKeys) {
              console.log(`  ${key.padEnd(40)} ${JSON.stringify(val)}`);
            }
          } else {
            console.log('  (none matching bedroom/room/basement/grade keywords)');
          }

          found = true;
          break;
        }

        if (found) break;
        if (results.length < PAGE_SIZE) {
          console.log('\n[probe] End of feed — listing not found.');
          break;
        }

        offset += PAGE_SIZE;
        page++;
        await sleep(300);
      }
    }
  );
}

main().catch(e => {
  console.error('[probe] FATAL:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
