/**
 * Diagnostic: prints the raw field names + values from one DDF listing.
 * Run with:  npx ts-node lib/scripts/ddfDumpFields.ts
 *
 * Look in the output for a field that contains:
 *   - A numeric ID like "22067286"
 *   - A realtor.ca URL like "https://www.realtor.ca/real-estate/22067286/..."
 *
 * That field is the source for external_id.
 */

import '../env';
import { getAutoLogoutClient } from 'rets-client';

async function main() {
  const loginUrl = process.env.DDF_LOGIN_URL!;
  const username = process.env.DDF_USERNAME!;
  const password = process.env.DDF_PASSWORD!;

  if (!loginUrl || !username || !password) {
    throw new Error('Missing DDF_LOGIN_URL, DDF_USERNAME, DDF_PASSWORD in env');
  }

  await (getAutoLogoutClient as any)(
    { loginUrl, username, password, version: 'RETS/1.7.2', userAgent: 'Tourit-Diag/1.0' },
    async (rets: any) => {
      // Fetch just 1 listing with standard names so field names are human-readable
      const result = await rets.search.query('Property', 'Property',
        '(LastUpdated=2020-01-01T00:00:00Z)',
        { limit: 1, offset: 1, count: 0, format: 'COMPACT', standardNames: 1 }
      );

      const item = result.results?.[0];
      if (!item) { console.log('No results returned.'); return; }

      console.log('\n=== RAW DDF FIELDS ===\n');
      for (const [key, val] of Object.entries(item)) {
        if (val !== null && val !== '' && val !== undefined) {
          console.log(`  ${key}: ${val}`);
        }
      }

      // Highlight fields that look like they could be the Realtor.ca ID
      console.log('\n=== CANDIDATE FIELDS (URL or numeric ID) ===\n');
      for (const [key, val] of Object.entries(item)) {
        const s = String(val ?? '');
        if (s.includes('realtor.ca') || /^\/real-estate\/\d+/.test(s) || /^\d{5,}$/.test(s)) {
          console.log(`  *** ${key}: ${s}`);
        }
      }
    }
  );
}

main().catch((err) => {
  console.error('FAILED:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
