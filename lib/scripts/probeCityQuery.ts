/**
 * Probes which DMQL field/syntax combinations the DDF server accepts.
 * Run: npx ts-node lib/scripts/probeCityQuery.ts
 */
import dotenv from 'dotenv';
import { getAutoLogoutClient } from 'rets-client';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

const queries = [
  // City field variants
  '(City=Richmond Hill)',
  '(City=|Richmond Hill|)',
  '(City=Richmond+Hill)',
  '(Municipality=Richmond Hill)',
  '(AddressCity=Richmond Hill)',
  // Status field variants
  '(Status=A)',
  '(StandardStatus=Active)',
  '(MlsStatus=Active)',
  // Province (known-working in fullSyncOntario)
  '(StateOrProvince=ON)',
  // Postal code prefix (ON postal codes start with L/M/K/N/P)
  '(PostalCode=L4C*)',   // L4C = Richmond Hill
  '(PostalCode=L3R*)',   // L3R = Markham
];

(async () => {
  await (getAutoLogoutClient as any)(
    {
      loginUrl:  process.env.DDF_LOGIN_URL!,
      username:  process.env.DDF_USERNAME!,
      password:  process.env.DDF_PASSWORD!,
      version:   'RETS/1.7.2',
      userAgent: 'Tourit-Probe/1.0',
    },
    async (rets: any) => {
      for (const q of queries) {
        try {
          const r = await rets.search.query('Property', 'Property', q,
            { limit: 1, offset: 1, count: 1, format: 'COMPACT', standardNames: 1 });
          const city = r.results?.[0]?.City ?? r.results?.[0]?.Municipality ?? '?';
          console.log(`✓  ${q.padEnd(40)}  count=${r.count ?? '?'}  city="${city}"`);
        } catch (e: any) {
          const msg = e.message?.match(/ReplyCode (\d+).*ReplyText: (.+)/);
          console.log(`✗  ${q.padEnd(40)}  ${msg ? `code=${msg[1]} ${msg[2]}` : e.message}`);
        }
      }
    }
  );
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
