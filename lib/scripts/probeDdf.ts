import '../env';
import { getAutoLogoutClient } from 'rets-client';

(async () => {
  await (getAutoLogoutClient as any)(
    {
      loginUrl:          process.env.DDF_LOGIN_URL!,
      username:          process.env.DDF_USERNAME!,
      password:          process.env.DDF_PASSWORD!,
      version:           'RETS/1.7.2',
      userAgent:         'RETS-Tourit/1.0',
      userAgentPassword: '',
    },
    async (client: any) => {
      // CREA DDF is a full-feed API — the standard query is by timestamp.
      // Get everything modified since epoch (all active listings).
      const queries = [
        '(ModificationTimestamp=1970-01-01T00:00:00+)',
        '(ListingKey=0+)',
        '(ListPrice=0+)',
        '(BedroomsTotal=0+)',
      ];

      for (const q of queries) {
        console.log(`\n--- Trying: ${q}`);
        try {
          const r = await client.search.query('Property', 'Property', q, { limit: 1, offset: 0 });
          console.log('✓ SUCCESS — replyCode:', r.replyCode, '| count:', r.count, '| rows:', r.rowsReceived);
          const row = (r.results?.[0] ?? {}) as Record<string, unknown>;
          const keys = Object.keys(row).filter(k => k !== 'info' && k !== 'metadata');
          const sample = Object.fromEntries(
            ['ListingKey','ListingId','City','StateOrProvince','PostalCode','ListPrice','Latitude','Longitude','BedroomsTotal','BathroomsTotal','PropertyType']
              .filter(k => keys.includes(k))
              .map(k => [k, row[k]])
          );
          console.log('Sample fields:', JSON.stringify(sample, null, 2));
          break;
        } catch (e: any) {
          console.log('✗', e.message);
        }
      }
    },
  );
})().catch(e => { console.error('Error:', e.message); process.exit(1); });
