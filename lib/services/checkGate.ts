import dotenv from 'dotenv';
import fs from 'fs';
import { getAutoLogoutClient } from 'rets-client';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

async function main() {
  const loginUrl = process.env.DDF_LOGIN_URL;
  const username = process.env.DDF_USERNAME;
  const password = process.env.DDF_PASSWORD;

  if (!loginUrl || !username || !password) {
    throw new Error('Missing DDF_LOGIN_URL, DDF_USERNAME, or DDF_PASSWORD.');
  }

  const result = await (getAutoLogoutClient as any)(
    {
      loginUrl,
      username,
      password,
      version: 'RETS/1.7.2',
      userAgent: 'Tourit Gate Check',
      userAgentPassword: '',
    },
    async (client: any) => {
      const response = await client.search.query(
        'Property',
        'Property',
        '(ID=29524858)',
        { limit: 1 } as any
      );

      return response;
    }
  );

  fs.writeFileSync('result.json', JSON.stringify(result, null, 2), 'utf8');
  console.log('Wrote result.json');
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('Gate check failed:', message);
  if (error instanceof Error && error.stack) {
    console.error(error.stack);
  }
  process.exitCode = 1;
});
