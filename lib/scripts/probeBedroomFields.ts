/**
 * Probes DDF to find BedroomsAboveGround / BedroomsBelowGround and room-level data.
 *
 * DDF rejects string equality queries (MLS#, City, etc.) — only timestamp queries work.
 * This script fetches 50 listings and finds the best candidates for above-grade analysis.
 *
 * Run:  npx ts-node lib/scripts/probeBedroomFields.ts
 */

import '../env';
import { getAutoLogoutClient } from 'rets-client';

const BEDROOM_KEYS = [
  'BedroomsAboveGround', 'BedroomsAboveGrade', 'AboveGradeBedrooms',
  'BedroomsBelowGround', 'BedroomsBelowGrade', 'BelowGradeBedrooms',
];

const ROOM_KEYS = Object.fromEntries(
  Array.from({ length: 20 }, (_, i) => [
    [`RoomType${i + 1}`, i + 1],
    [`RoomLevel${i + 1}`, i + 1],
    [`RoomDimensions${i + 1}`, i + 1],
    [`RoomLength${i + 1}`, i + 1],
    [`RoomWidth${i + 1}`, i + 1],
  ]).flat()
);

function findBedFields(node: Record<string, unknown>): Array<{ key: string; value: unknown }> {
  return BEDROOM_KEYS
    .filter(k => node[k] !== undefined && node[k] !== '' && node[k] !== null)
    .map(k => ({ key: k, value: node[k] }));
}

function extractRooms(item: Record<string, unknown>): Array<{ index: number; type: string; level: string; dims: string }> {
  const rooms: Array<{ index: number; type: string; level: string; dims: string }> = [];
  for (let i = 1; i <= 20; i++) {
    const type  = String(item[`RoomType${i}`]  ?? '').trim();
    const level = String(item[`RoomLevel${i}`] ?? '').trim();
    const dims  = String(item[`RoomDimensions${i}`] ?? item[`RoomLength${i}`] ?? '').trim();
    if (type) rooms.push({ index: i, type, level, dims });
  }
  return rooms;
}

function isHouse(item: Record<string, unknown>): boolean {
  const unit = String(item.UnitNumber ?? '').trim();
  const ptype = String(item.PropertyType ?? item.PropertySubType ?? '').toLowerCase();
  const ownership = String(item.OwnershipType ?? '').toLowerCase();
  if (unit) return false;
  if (ownership.includes('strata') || ownership.includes('condo')) return false;
  if (ptype.includes('condo') || ptype.includes('apartment') || ptype.includes('flat')) return false;
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

      // Fetch 50 listings — filter in TypeScript for houses with bedrooms
      const result = await rets.search.query(
        'Property', 'Property',
        '(LastUpdated=2020-01-01T00:00:00Z)',
        { limit: 50, offset: 1, count: 0, format: 'COMPACT', standardNames: 1 }
      );

      const items: Record<string, unknown>[] = result?.results ?? [];
      console.log(`\nFetched ${items.length} listings.`);

      // ── Find listings with direct above/below grade fields ───────────────────
      console.log('\n=== Listings with BedroomsAboveGround / BedroomsBelowGround ===');
      let foundDirect = 0;
      for (const item of items) {
        const hits = findBedFields(item);
        if (hits.length) {
          foundDirect++;
          console.log(`  MLS ${item.ListingId} (${item.City}) — ${item.PropertyType}`);
          for (const h of hits) console.log(`    ${h.key}: ${h.value}`);
        }
      }
      if (!foundDirect) console.log('  None found — DDF COMPACT does not provide above/below grade directly.');

      // ── Find houses with room-level data ─────────────────────────────────────
      console.log('\n=== Houses with RoomType / RoomLevel data ===');
      const houses = items.filter(isHouse);
      console.log(`  ${houses.length}/${items.length} listings look like houses.`);

      let foundRoomData = 0;
      for (const item of houses) {
        const rooms = extractRooms(item);
        if (rooms.length > 0) {
          foundRoomData++;
          console.log(`\n  MLS ${item.ListingId} (${item.City}) — Beds: ${item.BedroomsTotal}, Ownership: ${item.OwnershipType}`);
          for (const r of rooms) {
            console.log(`    Room ${r.index}: type="${r.type}" level="${r.level}" dims="${r.dims}"`);
          }
          if (foundRoomData >= 3) break; // Show max 3 examples
        }
      }

      if (!foundRoomData) {
        console.log('\n  No room-level data found in this batch.');
        console.log('  Showing first house listing raw fields relevant to bedrooms:');
        const sample = houses[0];
        if (sample) {
          const relevant = Object.entries(sample).filter(([k]) =>
            k.startsWith('Room') || k.includes('Bedroom') || k.includes('Level') || k.includes('Floor')
          );
          for (const [k, v] of relevant) {
            if (v !== '' && v !== null && v !== undefined) console.log(`    ${k}: ${v}`);
          }
        }
      }

      // ── Summary ──────────────────────────────────────────────────────────────
      console.log('\n=== Summary ===');
      if (foundDirect > 0) {
        console.log('✓ BedroomsAboveGround / BedroomsBelowGround ARE available in COMPACT.');
        console.log('  The adapter already maps them — data will populate on next sync.');
      } else if (foundRoomData > 0) {
        console.log('✗ No direct above/below grade fields. Room-level data is available.');
        console.log('  Can derive counts from RoomType + RoomLevel fields.');
      } else {
        console.log('✗ Neither above/below grade fields nor room-level data found in this batch.');
        console.log('  Try a different date range or check a specific listing with ListingKey query.');
      }
    }
  );
}

main().catch(err => {
  console.error('FAILED:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
