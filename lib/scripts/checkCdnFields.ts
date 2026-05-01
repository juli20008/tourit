/**
 * Checks the current state of CDN fields in mls_listings.
 * Run with:  npx ts-node lib/scripts/checkCdnFields.ts
 */

import '../env';

async function main() {
  const supaUrl = process.env.SUPABASE_URL!;
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!supaUrl || !supaKey) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');

  // 1. Overall counts
  const countResp = await fetch(
    `${supaUrl}/rest/v1/mls_listings?select=id,external_id,photos_timestamp,photos_count&limit=5000`,
    { headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}`, Accept: 'application/json' } }
  );
  const rows: any[] = await countResp.json();

  const total         = rows.length;
  const hasExtId      = rows.filter(r => r.external_id).length;
  const hasTimestamp  = rows.filter(r => r.photos_timestamp).length;
  const hasCount      = rows.filter(r => r.photos_count).length;

  // Detect precision-loss: a correct 18-digit tick ends in non-zero digits
  const precisionOk   = rows.filter(r => r.photos_timestamp && !/0{4,}$/.test(r.photos_timestamp)).length;
  const precisionBad  = rows.filter(r => r.photos_timestamp && /0{4,}$/.test(r.photos_timestamp)).length;

  console.log('\n=== CDN field coverage (first 5000 rows) ===');
  console.log(`  Total rows sampled : ${total}`);
  console.log(`  external_id set    : ${hasExtId}  (${pct(hasExtId, total)})`);
  console.log(`  photos_timestamp   : ${hasTimestamp}  (${pct(hasTimestamp, total)})`);
  console.log(`    └─ precision OK  : ${precisionOk}`);
  console.log(`    └─ trailing zeros: ${precisionBad}  ← still broken`);
  console.log(`  photos_count set   : ${hasCount}  (${pct(hasCount, total)})`);

  // 2. Show 5 sample rows (with external_id + timestamp)
  const samples = rows.filter(r => r.photos_timestamp).slice(0, 5);
  console.log('\n=== Sample rows with photos_timestamp ===');
  for (const r of samples) {
    const ts = r.photos_timestamp ?? '—';
    const trailingZeros = /0{4,}$/.test(ts) ? ' ← BAD (precision loss)' : ' ✓';
    console.log(`  mls=${r.external_id ?? '(null)'}  ts=${ts}${trailingZeros}  count=${r.photos_count ?? '—'}`);
  }

  // 3. Construct a sample CDN URL so we can test it
  const testRow = samples.find(r => r.external_id && r.photos_timestamp);
  if (testRow) {
    const url = `https://cdn.realtor.ca/listings/TS${testRow.photos_timestamp}/reb82/highres/4/${String(testRow.external_id).toLowerCase()}_1.jpg`;
    console.log('\n=== Sample CDN URL to test manually ===');
    console.log(' ', url);
    console.log('  Open this URL in your browser — if it returns an image, the CDN approach works.');
    console.log('  If 404/403, external_id is wrong or CDN access is blocked.');
  }
}

function pct(n: number, total: number) {
  return total ? `${Math.round(n / total * 100)}%` : '—';
}

main().catch(err => {
  console.error('FAILED:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
