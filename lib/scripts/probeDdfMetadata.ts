/**
 * Fetches DDF metadata lookups for RoomType and RoomLevel to get
 * the numeric code → text label mappings.
 *
 * Run:  npx ts-node lib/scripts/probeDdfMetadata.ts
 */

import '../env';
import { getAutoLogoutClient } from 'rets-client';

async function main() {
  const loginUrl = process.env.DDF_LOGIN_URL!;
  const username  = process.env.DDF_USERNAME!;
  const password  = process.env.DDF_PASSWORD!;
  if (!loginUrl || !username || !password) throw new Error('Missing DDF env vars');

  await (getAutoLogoutClient as any)(
    { loginUrl, username, password, version: 'RETS/1.7.2', userAgent: 'Tourit-Meta/1.0' },
    async (rets: any) => {

      for (const lookupName of ['RoomType', 'RoomLevel']) {
        console.log(`\n=== METADATA-LOOKUP: ${lookupName} ===`);
        try {
          const meta = await rets.metadata.getLookups('Property', lookupName);
          if (meta && meta.length > 0) {
            for (const entry of meta) {
              console.log(`  ${entry.LookupValue || entry.Value || entry.ID} → ${entry.LongValue || entry.ShortValue || entry.MetadataEntryID || JSON.stringify(entry)}`);
            }
          } else {
            console.log('  No entries returned.');
            console.log('  Raw:', JSON.stringify(meta, null, 2)?.slice(0, 500));
          }
        } catch (err: any) {
          console.error(`  Failed: ${err?.message ?? err}`);

          // Try alternative metadata approach
          try {
            console.log('  Trying getLookupValues...');
            const meta2 = await rets.metadata.getLookupValues('Property', lookupName);
            if (meta2 && meta2.length > 0) {
              for (const entry of meta2) {
                console.log(`  ${JSON.stringify(entry)}`);
              }
            } else {
              console.log('  Raw:', JSON.stringify(meta2, null, 2)?.slice(0, 500));
            }
          } catch (err2: any) {
            console.error(`  getLookupValues also failed: ${err2?.message ?? err2}`);
          }
        }
      }

      // Also try fetching the full metadata table to see what's available
      console.log('\n=== Available metadata method names on rets client ===');
      if (rets.metadata) {
        console.log(Object.keys(rets.metadata).join(', '));
      }
    }
  );
}

main().catch(err => {
  console.error('FAILED:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
