/**
 * Probes DDF COMPACT to find above-grade / basement bedroom data in GTA house listings.
 * Uses a recent date so results skew toward current Ontario listings.
 *
 * Run:  npx ts-node lib/scripts/probeBedroomFields.ts
 */

import '../env';
import { getAutoLogoutClient } from 'rets-client';

const BEDROOM_KEYS = [
  'BedroomsAboveGround', 'BedroomsAboveGrade', 'AboveGradeBedrooms',
  'BedroomsBelowGround', 'BedroomsBelowGrade', 'BelowGradeBedrooms',
];

function findBedFields(item: Record<string, unknown>) {
  return BEDROOM_KEYS.filter(k => item[k] !== undefined && item[k] !== '' && item[k] !== null);
}

function extractRooms(item: Record<string, unknown>) {
  const rooms: { i: number; type: string; level: string; len: string; width: string }[] = [];
  for (let i = 1; i <= 20; i++) {
    const type  = String(item[`RoomType${i}`]  ?? '').trim();
    const level = String(item[`RoomLevel${i}`] ?? '').trim();
    const len   = String(item[`RoomLength${i}`]   ?? item[`RoomDimensions${i}`] ?? '').trim();
    const width = String(item[`RoomWidth${i}`]    ?? '').trim();
    if (type || len) rooms.push({ i, type, level, len, width });
  }
  return rooms;
}

// Show ALL non-empty fields from an item that could relate to rooms or bedrooms
function dumpRelevantFields(item: Record<string, unknown>) {
  const keys = Object.keys(item).filter(k =>
    k.startsWith('Room') ||
    k.toLowerCase().includes('bedroom') ||
    k.toLowerCase().includes('floor') ||
    k.toLowerCase().includes('level') ||
    k.toLowerCase().includes('storey') ||
    k.toLowerCase().includes('grade')
  );
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    const v = item[k];
    if (v !== '' && v !== null && v !== undefined) out[k] = v;
  }
  return out;
}

function isHouse(item: Record<string, unknown>): boolean {
  const unit = String(item.UnitNumber ?? '').trim();
  const ownership = String(item.OwnershipType ?? '').toLowerCase();
  if (unit) return false;
  if (ownership.includes('strata') || ownership.includes('condo')) return false;
  return true;
}

async function main() {
  const loginUrl = process.env.DDF_LOGIN_URL!;
  const username  = process.env.DDF_USERNAME!;
  const password  = process.env.DDF_PASSWORD!;
  if (!loginUrl || !username || !password) throw new Error('Missing DDF env vars');

  await (getAutoLogoutClient as any)(
    { loginUrl, username, password, version: 'RETS/1.7.2', userAgent: 'Tourit-Probe/1.0' },
    async (rets: any) => {

      // Use a recent date — more likely to be active Ontario listings with full data
      const result = await rets.search.query(
        'Property', 'Property',
        '(LastUpdated=2025-01-01T00:00:00Z)',
        { limit: 100, offset: 1, count: 0, format: 'COMPACT', standardNames: 1 }
      );

      const items: Record<string, unknown>[] = result?.results ?? [];
      console.log(`Fetched ${items.length} listings.\n`);

      const houses = items.filter(isHouse);
      console.log(`${houses.length}/${items.length} are houses.\n`);

      // ── 1. Direct above/below grade fields ──────────────────────────────────
      console.log('=== Direct above/below grade bedroom fields ===');
      const withDirect = houses.filter(h => findBedFields(h).length > 0);
      if (withDirect.length) {
        for (const h of withDirect) {
          console.log(`  MLS ${h.ListingId} (${h.City}): ${findBedFields(h).map(k => `${k}=${h[k]}`).join(', ')}`);
        }
      } else {
        console.log('  None found in COMPACT.');
      }

      // ── 2. Room-level data ────────────────────────────────────────────────
      console.log('\n=== Houses with RoomType / RoomLevel data ===');
      const withRooms = houses.filter(h => extractRooms(h).length > 0);
      console.log(`  ${withRooms.length}/${houses.length} houses have room data.`);

      for (const h of withRooms.slice(0, 3)) {
        console.log(`\n  MLS ${h.ListingId} (${h.City}) — Beds: ${h.BedroomsTotal}, Own: ${h.OwnershipType}`);
        for (const r of extractRooms(h)) {
          console.log(`    Room ${r.i}: type="${r.type}" level="${r.level}" len="${r.len}" w="${r.width}"`);
        }
      }

      // ── 3. Dump all keys from first few houses ────────────────────────────
      console.log('\n=== ALL AVAILABLE KEYS (first house) ===');
      if (houses[0]) {
        console.log(Object.keys(houses[0]).sort().join('\n'));
      }

      // ── 4. Bedroom/room/floor related non-empty fields ────────────────────
      console.log('\n=== Bedroom/room/floor fields with values (first 5 houses) ===');
      for (const h of houses.slice(0, 5)) {
        const fields = dumpRelevantFields(h);
        if (Object.keys(fields).length) {
          console.log(`  MLS ${h.ListingId} (${h.City}):`);
          for (const [k, v] of Object.entries(fields)) console.log(`    ${k}: ${v}`);
        }
      }
    }
  );
}

main().catch(err => {
  console.error('FAILED:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
