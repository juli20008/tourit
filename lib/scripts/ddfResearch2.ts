import '../env';
import { getAutoLogoutClient } from 'rets-client';

// ── helpers (保持不变) ───────────────────────────────────────────────────

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

// ── main (修改后的完整逻辑) ─────────────────────────────────────────────────────

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
    { loginUrl, username, password, version: 'RETS/1.7.2', userAgent: 'Tourit-Research/1.0' },
    async (rets: any) => {
      // 1. 修改这里：把 limit 改成 20
      const result = await rets.search.query(
        'Property', 'Property',
        '(LastUpdated=2024-01-01T00:00:00Z)', 
        { limit: 20, format: 'COMPACT', standardNames: 1 }
      );

      const items = result.results || [];
      if (items.length === 0) throw new Error('DDF returned no results');

      console.log(`\n[ddf-research] Found ${items.length} listings. Processing...\n`);

      // 2. 循环处理这 20 条数据
      for (const item of items) {
        const rawData = flatten(item as Record<string, any>);
        
        // 打印每行的关键特征，帮你分清 House/Condo/Townhouse
        console.log(`--------------------------------------------------`);
        console.log(`ListingId: ${rawData.ListingId}`);
        console.log(`Address:   ${rawData.UnparsedAddress}`);
        console.log(`Ownership: ${rawData.OwnershipType}`); // 1=Freehold, 12=Condo
        console.log(`Unit:      ${rawData.UnitNumber || 'NONE'}`);
        console.log(`Fee:       ${rawData.AssociationFee || '0'}`);
        
        // 插入数据库
        await supabaseInsert(supaUrl, supaKey, { raw_data: rawData });
      }

      console.log(`\n[ddf-research] Successfully saved ${items.length} rows to Supabase ✓`);
    }
  );
}

main().catch(err => {
  console.error('[ddf-research] FAILED:', err);
  process.exitCode = 1;
});