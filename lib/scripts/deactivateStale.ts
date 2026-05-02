/**
 * Mark listings as Inactive when they haven't appeared in a DDF sync for
 * STALE_DAYS or more.  A listing that no longer exists in DDF will stop
 * having its last_seen_at updated, so it eventually crosses this threshold.
 *
 * Run:
 *   npx ts-node lib/scripts/deactivateStale.ts
 *   npx ts-node lib/scripts/deactivateStale.ts --dry-run --days=30
 */

import dotenv from 'dotenv';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getArg(name: string): string | null {
  const a = process.argv.find(x => x.startsWith(`--${name}=`));
  return a ? a.split('=').slice(1).join('=') : null;
}

const STALE_DAYS = parseInt(getArg('days') ?? '30', 10);
const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Missing Supabase env vars');

  const cutoff = new Date(Date.now() - STALE_DAYS * 86400_000).toISOString();
  console.log(`[deactivate] Cutoff: ${cutoff}  (listings not seen in ${STALE_DAYS}+ days)`);
  console.log(`[deactivate] Dry run: ${DRY_RUN}`);

  // Fetch listings to deactivate
  const fetchUrl = `${SUPABASE_URL}/rest/v1/mls_listings` +
    `?select=mls_number,standard_status,last_seen_at` +
    `&last_seen_at=lt.${encodeURIComponent(cutoff)}` +
    `&standard_status=neq.Inactive`;

  const res = await fetch(fetchUrl, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${await res.text()}`);
  const rows: any[] = await res.json();

  console.log(`[deactivate] Found ${rows.length} stale listing(s) to deactivate`);
  if (rows.length === 0) { console.log('[deactivate] Nothing to do.'); return; }

  if (DRY_RUN) {
    rows.slice(0, 20).forEach(r =>
      console.log(`  [dry] ${r.mls_number}  last_seen=${r.last_seen_at}  status=${r.standard_status}`)
    );
    if (rows.length > 20) console.log(`  ... and ${rows.length - 20} more`);
    return;
  }

  // PATCH in batches via individual updates (PostgREST has no bulk-update-by-list)
  let ok = 0;
  let failed = 0;
  for (const row of rows) {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/mls_listings?mls_number=eq.${encodeURIComponent(row.mls_number)}`,
      {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ standard_status: 'Inactive' }),
      }
    );
    if (r.ok) { ok++; } else { failed++; console.warn(`  PATCH failed for ${row.mls_number}: ${r.status}`); }
  }

  console.log(`\n[deactivate] === DONE ===`);
  console.log(`  Deactivated: ${ok}`);
  console.log(`  Failed:      ${failed}`);
}

main().catch(e => {
  console.error('[deactivate] FATAL:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
