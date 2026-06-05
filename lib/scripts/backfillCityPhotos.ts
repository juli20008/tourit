/**
 * Fast photo backfill for specific cities.
 * Reads listing IDs directly from Supabase (no DDF full-feed scan needed)
 * then calls GetObject using the numeric id (= DDF ListingKey).
 *
 * Run:
 *   npx ts-node lib/scripts/backfillCityPhotos.ts
 *   npx ts-node lib/scripts/backfillCityPhotos.ts --cities="Vaughan,Markham"
 *   npx ts-node lib/scripts/backfillCityPhotos.ts --max=500 --delay-ms=1000
 *   npx ts-node lib/scripts/backfillCityPhotos.ts --all --state=Ontario
 */

import dotenv from 'dotenv';
import { DdfPhotoSession } from '../services/ddfPhotoFetcher';
import { getPool, patchImages as patchImagesDb } from '../db';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

function getArg(name: string): string | null {
  const a = process.argv.find(x => x.startsWith(`--${name}=`));
  return a ? a.split('=').slice(1).join('=') : null;
}

const FETCH_ALL  = process.argv.includes('--all');
const MAX        = parseInt(getArg('max') ?? '99999', 10);
const DELAY_MS   = parseInt(getArg('delay-ms') ?? '800', 10);
const BATCH_SIZE = 500; // Supabase rows per page

const CITIES_ARG = getArg('cities');
const CITIES: string[] = CITIES_ARG
  ? CITIES_ARG.split(',').map(c => c.trim()).filter(Boolean)
  : ['Toronto', 'North York', 'Scarborough', 'Etobicoke', 'East York'];

const STATE_ARG = getArg('state'); // e.g. --state=Ontario

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function loadTargets(): Promise<Array<{ mls_number: string; id: number }>> {
  const pool = getPool();
  const CITY_SET_LC = new Set(CITIES.map(c => c.toLowerCase()));
  const STATE_SET = STATE_ARG === 'Ontario'
    ? new Set(['Ontario', 'ON'])
    : (STATE_ARG ? new Set([STATE_ARG]) : null);

  const targets: Array<{ mls_number: string; id: number }> = [];
  let lastId = 0;
  let scanned = 0;

  while (true) {
    const res = await pool.query(
      `SELECT mls_number, id, state, standard_status, city
       FROM mls_listings WHERE id > $1 ORDER BY id ASC LIMIT $2`,
      [lastId, BATCH_SIZE]
    );
    const rows = res.rows;
    if (!rows.length) break;

    scanned += rows.length;
    lastId = Number(rows[rows.length - 1].id);

    for (const r of rows) {
      const numId = Number(r.id);
      if (!r.mls_number || !numId || !Number.isInteger(numId) || numId <= 0) continue;
      if (['Inactive', 'Sold', 'Expired', 'Cancelled', 'Withdrawn'].includes(r.standard_status)) continue;
      if (STATE_SET && !STATE_SET.has(String(r.state ?? ''))) continue;
      if (!FETCH_ALL) {
        const cityLc = String(r.city ?? '').replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase();
        if (!CITY_SET_LC.has(cityLc)) continue;
      }
      targets.push({ mls_number: String(r.mls_number), id: numId });
    }

    if (scanned % 10000 < BATCH_SIZE) {
      process.stdout.write(`\r[backfill] Scanned ${scanned.toLocaleString()} rows, found ${targets.length} targets…`);
    }

    if (rows.length < BATCH_SIZE) break;
    if (targets.length >= MAX) break;
  }

  process.stdout.write('\n');
  return targets.slice(0, MAX);
}

async function main() {
  const loginUrl = process.env.DDF_LOGIN_URL!;
  const username  = process.env.DDF_USERNAME!;
  const password  = process.env.DDF_PASSWORD!;

  if (!loginUrl || !username || !password || !process.env.DATABASE_URL) {
    throw new Error('Missing required env vars (DDF_LOGIN_URL, DDF_USERNAME, DDF_PASSWORD, DATABASE_URL)');
  }

  const scopeLabel = STATE_ARG ? `state=${STATE_ARG}` : (FETCH_ALL ? 'all cities' : CITIES.join(', '));
  console.log(`[backfill] Finding active Ontario listings with lat/lng from Supabase (${scopeLabel})…`);

  const targets = await loadTargets();
  const limited = targets.slice(0, MAX);
  console.log(`[backfill] Found ${targets.length} listings needing photos → processing ${limited.length}`);
  if (targets.length > 0) {
    console.log(`[backfill] First 5 targets: ${targets.slice(0, 5).map(t => `${t.mls_number}(id=${t.id})`).join(', ')}`);
  }

  if (!limited.length) {
    console.log('[backfill] Nothing to do.');
    return;
  }

  const photoSession = new DdfPhotoSession(loginUrl, username, password);
  await photoSession.login();
  console.log('[backfill] DDF photo session ready.\n');

  let ok = 0, zero = 0, failed = 0;

  for (let i = 0; i < limited.length; i++) {
    const { mls_number, id } = limited[i];
    process.stdout.write(`\r[backfill] ${i + 1}/${limited.length} | ok=${ok} zero=${zero} failed=${failed}   `);

    await sleep(DELAY_MS);
    try {
      const urls = await photoSession.fetchPhotoUrls(id);
      if (urls.length > 0) {
        await patchImagesDb(mls_number, urls);
        ok++;
      } else {
        zero++;
      }
    } catch (e: any) {
      failed++;
      process.stdout.write(`\n  ✗ ${mls_number} (key=${id}): ${e.message}\n`);
    }
  }

  console.log(`\n\n[backfill] === DONE ===`);
  console.log(`  Photos saved : ${ok}`);
  console.log(`  Zero URLs    : ${zero}`);
  console.log(`  Errors       : ${failed}`);
}

main().catch(e => {
  console.error('[backfill] FATAL:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
