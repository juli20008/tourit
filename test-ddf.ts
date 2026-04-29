import dotenv from 'dotenv';

const { Client } = require('rets-client');

dotenv.config({ path: '.env.local' });

type DdfEnv = {
  DDF_LOGIN_URL?: string;
  DDF_USERNAME?: string;
  DDF_PASSWORD?: string;
};

async function main() {
  const env = process.env as NodeJS.ProcessEnv & DdfEnv;
  const { DDF_LOGIN_URL, DDF_USERNAME, DDF_PASSWORD } = env;

  if (!DDF_LOGIN_URL || !DDF_USERNAME || !DDF_PASSWORD) {
    throw new Error('Missing one or more required env vars: DDF_LOGIN_URL, DDF_USERNAME, DDF_PASSWORD');
  }

  const client = new Client({
    loginUrl: DDF_LOGIN_URL,
    username: DDF_USERNAME,
    password: DDF_PASSWORD,
    version: 'RETS/1.7.2',
    userAgent: 'Tourit DDF Test Client',
  });

  try {
    await client.login();
    console.log('Login successful.');

    const searchOptions = {
      limit: 1,
      format: 'STANDARD-XML',
      StandardNames: 0,
    } as any;

    const result = await client.search.query(
      'Property',
      'Property',
      '(ID=29524858)',
      searchOptions
    );

    console.log(JSON.stringify(result, null, 2));
  } finally {
    await client.logout().catch((error: unknown) => {
      console.error('Logout failed:', error);
    });
  }
}

main().catch((error: unknown) => {
  console.error('DDF test failed:', error);
  process.exitCode = 1;
});
