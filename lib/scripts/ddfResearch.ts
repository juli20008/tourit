/**
 * Fetches one DDF listing (all fields, StandardNames mode) and stores the
 * raw JSON in the ddf_research table in Supabase for field inspection.
 *
 * Run with:
 *   npx ts-node lib/scripts/ddfResearch.ts
 *
 * Required env vars (in .env.local):
 *   DDF_LOGIN_URL, DDF_USERNAME, DDF_PASSWORD
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import '../env';
import { getAutoLogoutClient } from 'rets-client';

// ── helpers ───────────────────────────────────────────────────────────────────

/** Recursively collapse nested objects into dot-separated keys. */
function flatten(obj: Record<string, any>, prefix = ''): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, flatten(v as Record<string, any>, key));
    } else {
      out[key] = v;
    }
  }
  return out;
}

async function supabaseInsert(url: string, key: string, row: Record<string, unknown>) {
  const res = await fetch(`${url}/rest/v1/ddf_research`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`Supabase insert failed ${res.status}: ${await res.text()}`);
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const loginUrl = process.env.DDF_LOGIN_URL;
  const username  = process.env.DDF_USERNAME;
  const password  = process.env.DDF_PASSWORD;
  const supaUrl   = process.env.SUPABASE_URL;
  const supaKey   = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!loginUrl || !username || !password || !supaUrl || !supaKey) {
    throw new Error('Missing env vars: DDF_LOGIN_URL, DDF_USERNAME, DDF_PASSWORD, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  }

  let rawData: Record<string, unknown> = {};

  await (getAutoLogoutClient as any)(
    { loginUrl, username, password, version: 'RETS/1.7.2', userAgent: 'Tourit-Research/1.0' },
    async (rets: any) => {
      // StandardNames=1 gives human-readable field names.
      // offset:1 skips the first record for variety; adjust as needed.
      const result = await rets.search.query(
        'Property', 'Property',
        '(LastUpdated=2020-01-01T00:00:00Z)',
        { limit: 1, offset: 1, count: 0, format: 'COMPACT', standardNames: 1 }
      );

      const item = result.results?.[0];
      if (!item) throw new Error('DDF returned no results');

      // rets-client already converts RETS XML → JS object; we just flatten it.
      rawData = flatten(item as Record<string, any>);

      console.log(`\n[ddf-research] Fetched listing — ${Object.keys(rawData).length} fields\n`);

      // Print all non-empty fields for immediate inspection
      for (const [k, v] of Object.entries(rawData)) {
        if (v !== null && v !== '' && v !== undefined) {
          console.log(`  ${k}: ${v}`);
        }
      }
    }
  );

  // Persist to Supabase
  await supabaseInsert(supaUrl, supaKey, { raw_data: rawData });
  console.log('\n[ddf-research] Saved to ddf_research table ✓');
  console.log('[ddf-research] Query in Supabase SQL editor:');
  console.log("  SELECT raw_data FROM ddf_research ORDER BY fetched_at DESC LIMIT 1;\n");
}

main().catch(err => {
  console.error('[ddf-research] FAILED:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
