/**
 * Full DDF inventory check: query every current DDF listing, compare with
 * Supabase, and immediately mark any listing that no longer exists in DDF
 * as Inactive.
 *
 * Run:
 *   npx ts-node lib/scripts/deactivateStale.ts
 *   npx ts-node lib/scripts/deactivateStale.ts --dry-run
 */

import dotenv from 'dotenv';
import { getAutoLogoutClient } from 'rets-client';
import { fetchActiveMlsNumbers, deactivateListing } from '../db';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

const DRY_RUN = process.argv.includes('--dry-run');
const PAGE_SIZE = 500;
const PAGE_DELAY = 100;

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function markInactive(mlsNumbers: string[]): Promise<number> {
  let ok = 0;
  for (const mls of mlsNumbers) {
    try {
      await deactivateListing(mls);
      ok++;
    } catch (e: any) {
      console.warn(`  deactivate failed for ${mls}: ${e.message}`);
    }
  }
  return ok;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const loginUrl = process.env.DDF_LOGIN_URL!;
  const username = process.env.DDF_USERNAME!;
  const password = process.env.DDF_PASSWORD!;

  if (!loginUrl || !username || !password || !process.env.DATABASE_URL) {
    throw new Error('Missing required env vars (DDF_LOGIN_URL, DDF_USERNAME, DDF_PASSWORD, DATABASE_URL)');
  }

  console.log(`[deactivate] Fetching all active MLS numbers from DB…`);
  const supabaseNumbers = await fetchActiveMlsNumbers();
  console.log(`[deactivate] DB has ${supabaseNumbers.size} non-inactive listings`);

  console.log(`[deactivate] Querying ALL current DDF listings…`);
  const ddfNumbers = new Set<string>();

  await (getAutoLogoutClient as any)(
    { loginUrl, username, password, version: 'RETS/1.7.2', userAgent: 'Tourit-Deactivate/1.0' },
    async (rets: any) => {
      let offset = 1;
      let page = 0;

      while (true) {
        page++;
        let items: any[];
        try {
          const result = await rets.search.query(
            'Property', 'Property',
            '(LastUpdated=2023-01-01T00:00:00Z)',
            { limit: PAGE_SIZE, offset, count: 1, format: 'COMPACT', standardNames: 1 } as any
          );
          items = result.results ?? [];
          if (page === 1) console.log(`[deactivate] DDF total: ${result.count ?? '?'} listings`);
          if (!items.length) break;
        } catch (e: any) {
          console.error(`[deactivate] DDF search failed on page ${page}: ${e.message}`);
          break;
        }

        for (const item of items) {
          const mls = String(
            item.ListingId ?? item.ListingID ?? item.MLS_NUM ?? item.MlsNumber ?? item.ListingKey ?? ''
          );
          if (mls) ddfNumbers.add(mls);
        }

        if (page % 50 === 0) console.log(`[deactivate]   …page ${page}, ${ddfNumbers.size} DDF numbers so far`);
        if (items.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
        await sleep(PAGE_DELAY);
      }
    }
  );

  console.log(`[deactivate] DDF returned ${ddfNumbers.size} active listings`);

  // Listings in Supabase but NOT in DDF → no longer exist
  const toDeactivate = [...supabaseNumbers].filter(mls => !ddfNumbers.has(mls));
  console.log(`[deactivate] ${toDeactivate.length} listing(s) no longer in DDF → marking Inactive`);

  if (toDeactivate.length === 0) {
    console.log('[deactivate] Nothing to deactivate.');
    return;
  }

  if (DRY_RUN) {
    toDeactivate.slice(0, 20).forEach(mls => console.log(`  [dry] ${mls}`));
    if (toDeactivate.length > 20) console.log(`  ... and ${toDeactivate.length - 20} more`);
    return;
  }

  const deactivated = await markInactive(toDeactivate);
  console.log(`\n[deactivate] === DONE === Deactivated ${deactivated} listing(s)`);
}

main().catch(e => {
  console.error('[deactivate] FATAL:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
