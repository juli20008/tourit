/**
 * Searches the Media (or Photo) resource for a known listing and stores
 * the raw result in ddf_research.
 *
 * Run with:
 *   npx ts-node lib/scripts/ddfMediaSearch.ts
 *
 * Adjust LISTING_KEY below if needed.
 */

import '../env';
import { getAutoLogoutClient } from 'rets-client';

const LISTING_KEY = '24159896';

// Resources + classes to try in order.
// CREA DDF boards vary; we try the most common combos.
const CANDIDATES = [
  { resource: 'Media',    className: 'Media'    },
  { resource: 'Media',    className: 'Photo'    },
  { resource: 'Media',    className: ''         },
  { resource: 'Photo',    className: 'Photo'    },
  { resource: 'Photo',    className: ''         },
];

async function supabaseUpsert(
  supaUrl: string,
  supaKey: string,
  rawData: Record<string, unknown>,
  note: string
) {
  const res = await fetch(`${supaUrl}/rest/v1/ddf_research`, {
    method: 'POST',
    headers: {
      apikey: supaKey,
      Authorization: `Bearer ${supaKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ raw_data: { _note: note, ...rawData } }),
  });
  if (!res.ok) throw new Error(`Supabase insert failed ${res.status}: ${await res.text()}`);
}

async function trySearch(rets: any, resource: string, className: string): Promise<any[] | null> {
  try {
    const query = `(ListingKey=${LISTING_KEY})`;
    const opts: Record<string, any> = {
      limit: 50,
      offset: 1,
      count: 0,
      format: 'COMPACT',
      standardNames: 1,
    };

    const result = className
      ? await rets.search.query(resource, className, query, opts)
      : await rets.search.query(resource, resource, query, opts);   // class = resource name fallback

    const rows: any[] = result.results ?? [];
    return rows;
  } catch (err: any) {
    console.log(`  ✗ ${resource}/${className || resource}: ${err?.message ?? err}`);
    return null;
  }
}

async function main() {
  const loginUrl = process.env.DDF_LOGIN_URL;
  const username  = process.env.DDF_USERNAME;
  const password  = process.env.DDF_PASSWORD;
  const supaUrl   = process.env.SUPABASE_URL;
  const supaKey   = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!loginUrl || !username || !password || !supaUrl || !supaKey) {
    throw new Error('Missing env vars');
  }

  await (getAutoLogoutClient as any)(
    { loginUrl, username, password, version: 'RETS/1.7.2', userAgent: 'Tourit-Media/1.0' },
    async (rets: any) => {

      // ── First: list all available resources so we know what exists ──────────
      console.log('\n[ddf-media] Fetching available RETS resources…');
      try {
        const meta = await rets.metadata.getResources();
        const resources = (meta?.results ?? []).map((r: any) => r.ResourceID ?? r.resource ?? r);
        console.log(`  Resources: ${resources.join(', ')}`);
      } catch (e: any) {
        console.log(`  (metadata.getResources failed: ${e?.message})`);
      }

      // ── Try each Media/Photo candidate ──────────────────────────────────────
      console.log(`\n[ddf-media] Searching for ListingKey=${LISTING_KEY} across candidates…\n`);

      for (const { resource, className } of CANDIDATES) {
        const label = `${resource}/${className || resource}`;
        process.stdout.write(`  Trying ${label}… `);
        const rows = await trySearch(rets, resource, className);

        if (rows === null) continue;          // error already printed
        if (rows.length === 0) { console.log('0 rows'); continue; }

        console.log(`✓  ${rows.length} row(s) found!`);

        // Print every non-empty field
        console.log('\n=== Fields ===');
        for (const [k, v] of Object.entries(rows[0])) {
          if (v !== null && v !== '' && v !== undefined) {
            console.log(`  ${k}: ${v}`);
          }
        }

        // Highlight anything that looks like a photo URL or TS code
        console.log('\n=== Photo / URL candidates ===');
        for (const [k, v] of Object.entries(rows[0])) {
          const s = String(v ?? '');
          if (
            s.includes('http') ||
            s.includes('TS') ||
            /photo|image|media|url|cdn/i.test(k)
          ) {
            console.log(`  *** ${k}: ${s}`);
          }
        }

        // Store all rows in ddf_research
        for (const row of rows) {
          await supabaseUpsert(supaUrl, supaKey, row as Record<string, unknown>, label);
        }
        console.log(`\n[ddf-media] ${rows.length} row(s) saved to ddf_research ✓`);
        return;   // stop on first success
      }

      console.log('\n[ddf-media] No Media/Photo resource found on this DDF server.');
      console.log('  → Photos must be fetched via binary GetObject (no Location=1 support).');
      console.log('  → Next step: download binaries and upload to Supabase Storage.');
    }
  );
}

main().catch(err => {
  console.error('[ddf-media] FAILED:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
