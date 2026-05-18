/**
 * Fetches DDF metadata to decode RoomType and RoomLevel numeric codes.
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

      // ── 1. List all lookup names so we can find the right ones ───────────────
      console.log('=== All lookup names (LookupName + VisibleName) ===');
      const lookupsResult = await rets.metadata.getLookups('Property', '*');
      const allLookups: any[] = lookupsResult?.results?.[0]?.metadata ?? [];
      for (const l of allLookups) {
        console.log(`  ${l.LookupName} → "${l.VisibleName}"`);
      }

      // ── 2. Find room-related lookups ─────────────────────────────────────────
      const roomLookups = allLookups.filter((l: any) =>
        (l.LookupName ?? '').toLowerCase().includes('room') ||
        (l.VisibleName ?? '').toLowerCase().includes('room') ||
        (l.LookupName ?? '').toLowerCase().includes('level') ||
        (l.VisibleName ?? '').toLowerCase().includes('level') ||
        (l.LookupName ?? '').toLowerCase().includes('floor') ||
        (l.VisibleName ?? '').toLowerCase().includes('floor')
      );

      console.log(`\n=== Room/Level related lookups (${roomLookups.length} found) ===`);
      for (const l of roomLookups) {
        console.log(`  ${l.LookupName} → "${l.VisibleName}"`);
      }

      // ── 3. Get code→label values for each room-related lookup ────────────────
      for (const lookup of roomLookups) {
        const name = lookup.LookupName;
        console.log(`\n=== getLookupTypes: ${name} ===`);
        try {
          const typesResult = await rets.metadata.getLookupTypes('Property', name);
          const types: any[] = typesResult?.results?.[0]?.metadata ?? typesResult?.results ?? [];
          if (types.length) {
            for (const t of types) {
              const id    = t.LookupValue ?? t.Value ?? t.ID ?? t.MetadataEntryID ?? '?';
              const label = t.LongValue ?? t.ShortValue ?? t.VisibleName ?? t.Name ?? '?';
              console.log(`  ${id} → "${label}"`);
            }
          } else {
            console.log('  (empty) raw:', JSON.stringify(typesResult, null, 2)?.slice(0, 300));
          }
        } catch (e: any) {
          console.error(`  Error: ${e.message}`);
        }
      }

      // ── 4. Fallback: also try the exact names from the COMPACT field list ────
      for (const name of ['RoomType', 'RoomLevel', 'TypeofRoom', 'LevelofRoom', 'Room']) {
        if (roomLookups.some((l: any) => l.LookupName === name)) continue; // already done
        console.log(`\n=== getLookupTypes (direct): ${name} ===`);
        try {
          const r = await rets.metadata.getLookupTypes('Property', name);
          const types: any[] = r?.results?.[0]?.metadata ?? r?.results ?? [];
          if (types.length) {
            for (const t of types) {
              console.log(`  ${t.LookupValue ?? t.Value ?? t.ID} → "${t.LongValue ?? t.ShortValue ?? t.VisibleName}"`);
            }
          } else {
            console.log('  Not found or empty.');
          }
        } catch (e: any) {
          console.log(`  Not found: ${e.message}`);
        }
      }
    }
  );
}

main().catch(err => {
  console.error('FAILED:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
