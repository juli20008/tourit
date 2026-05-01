/**
 * Fetches one DDF listing in STANDARD-XML format, which embeds photo URLs
 * (including TS-coded CDN links) directly in the PropertyDetails payload.
 *
 * Run with:
 *   npx ts-node lib/scripts/ddfStandardXml.ts
 */

import '../env';
import { getAutoLogoutClient } from 'rets-client';

const LISTING_KEY = '24159896';
const TS_RE = /\/TS(\d{15,19})\//;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Recursively walk any object/array and collect every string value that
 *  looks like a URL or contains a TS code, along with its key path. */
function findUrls(node: unknown, path = ''): Array<{ path: string; value: string }> {
  if (!node || typeof node !== 'object') {
    if (typeof node === 'string' && (node.includes('http') || node.includes('TS'))) {
      return [{ path, value: node }];
    }
    return [];
  }
  const hits: Array<{ path: string; value: string }> = [];
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    hits.push(...findUrls(v, path ? `${path}.${k}` : k));
  }
  return hits;
}

/** Recursively flatten any depth of nested objects into dotted keys. */
function flatten(node: unknown, prefix = ''): Record<string, unknown> {
  if (!node || typeof node !== 'object' || Array.isArray(node)) {
    return prefix ? { [prefix]: node } : {};
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, flatten(v, key));
    } else {
      out[key] = v;
    }
  }
  return out;
}

async function supabaseInsert(supaUrl: string, supaKey: string, rawData: unknown, note: string) {
  const res = await fetch(`${supaUrl}/rest/v1/ddf_research`, {
    method: 'POST',
    headers: {
      apikey: supaKey,
      Authorization: `Bearer ${supaKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ raw_data: { _note: note, _data: rawData } }),
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const loginUrl = process.env.DDF_LOGIN_URL;
  const username  = process.env.DDF_USERNAME;
  const password  = process.env.DDF_PASSWORD;
  const supaUrl   = process.env.SUPABASE_URL;
  const supaKey   = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!loginUrl || !username || !password || !supaUrl || !supaKey) {
    throw new Error('Missing required env vars');
  }

  await (getAutoLogoutClient as any)(
    { loginUrl, username, password, version: 'RETS/1.7.2', userAgent: 'Tourit-XML/1.0' },
    async (rets: any) => {

      // ── Try STANDARD-XML format ─────────────────────────────────────────────
      console.log(`\n[ddf-xml] Fetching listing ${LISTING_KEY} in STANDARD-XML format…`);

      let result: any;
      try {
        result = await rets.search.query(
          'Property', 'Property',
          `(ListingKey=${LISTING_KEY})`,
          {
            limit: 1,
            offset: 1,
            count: 0,
            format: 'STANDARD-XML',
            standardNames: 1,
          }
        );
      } catch (err: any) {
        console.error('[ddf-xml] STANDARD-XML query failed:', err?.message ?? err);
        // Fall back to COMPACT with standardNames so we at least see what fields exist
        console.log('[ddf-xml] Falling back to COMPACT format…');
        result = await rets.search.query(
          'Property', 'Property',
          `(LastUpdated=2020-01-01T00:00:00Z)`,
          { limit: 1, offset: 1, count: 0, format: 'COMPACT', standardNames: 1 }
        );
      }

      const raw = result?.results?.[0] ?? result?.result ?? result;
      if (!raw) { console.log('[ddf-xml] No results returned.'); return; }

      // ── Print the full structure so we can see what came back ───────────────
      console.log('\n=== Full raw result (JSON) ===');
      console.log(JSON.stringify(raw, null, 2).slice(0, 8000));  // cap at 8k chars

      // ── Search the tree for any URL / TS-coded strings ─────────────────────
      const urlHits = findUrls(raw);
      if (urlHits.length) {
        console.log('\n=== URL / TS candidates found ===');
        for (const h of urlHits) {
          const ts = h.value.match(TS_RE)?.[1] ?? null;
          console.log(`  PATH : ${h.path}`);
          console.log(`  VALUE: ${h.value}`);
          if (ts) console.log(`  TS   : ${ts}  ← 18-digit code`);
          console.log();
        }
      } else {
        console.log('\n(No URL or TS strings found in this result)');
      }

      // ── Specifically drill into PropertyDetails.Photo if it exists ──────────
      const photos =
        (raw as any)?.PropertyDetails?.Photo?.PropertyPhoto ??
        (raw as any)?.Photo?.PropertyPhoto ??
        (raw as any)?.PropertyPhoto ??
        null;

      if (photos) {
        const photoArr = Array.isArray(photos) ? photos : [photos];
        console.log(`\n=== PropertyPhoto entries (${photoArr.length}) ===`);
        for (const p of photoArr) {
          console.log(JSON.stringify(p, null, 2));
        }
      }

      // ── Persist to Supabase ─────────────────────────────────────────────────
      await supabaseInsert(supaUrl, supaKey, raw, 'STANDARD-XML attempt');
      console.log('\n[ddf-xml] Saved to ddf_research ✓');
    }
  );
}

main().catch(err => {
  console.error('[ddf-xml] FAILED:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
