/**
 * Fetches listing photo URLs via raw RETS GetObject (COMPACT XML response).
 *
 * Flow per call:
 *  1. Login once with HTTP Digest → session cookies + nonce
 *  2. For each listing: GET GetObject with same nonce (nc incrementing)
 *  3. Parse COMPACT XML → extract MediaUrl column values
 *  4. Auto-renew session if nonce rejected (401) or RETS 20701
 */
import * as https from 'https';
import * as crypto from 'crypto';

// ─── Internals ────────────────────────────────────────────────────────────────

const md5 = (s: string) => crypto.createHash('md5').update(s).digest('hex');

function parseChallenge(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of header.matchAll(/(\w+)="([^"]+)"/g)) out[m[1]] = m[2];
  for (const m of header.matchAll(/(\w+)=([^",\s]+)/g)) if (!out[m[1]]) out[m[1]] = m[2];
  return out;
}

type RawResp = { status: number; headers: Record<string, string | string[]>; body: Buffer };

function rawGet(urlStr: string, extra: Record<string, string> = {}): Promise<RawResp> {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'GET',
        headers: { 'User-Agent': 'Tourit/1.0', Accept: '*/*', 'RETS-Version': 'RETS/1.7.2', ...extra },
      },
      res => {
        const chunks: Buffer[] = [];
        res.on('data', c => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on('end', () =>
          resolve({ status: res.statusCode!, headers: res.headers as any, body: Buffer.concat(chunks) })
        );
      }
    );
    req.on('error', reject);
    req.end();
  });
}

function buildDigest(
  method: string,
  uri: string,
  ch: Record<string, string>,
  user: string,
  pass: string,
  nc: string,
  cnonce: string
): string {
  const ha1 = md5(`${user}:${ch.realm}:${pass}`);
  const ha2 = md5(`${method}:${uri}`);
  let resp: string;
  let extra = '';
  if (ch.qop) {
    resp  = md5(`${ha1}:${ch.nonce}:${nc}:${cnonce}:${ch.qop}:${ha2}`);
    extra = `, qop=${ch.qop}, nc=${nc}, cnonce="${cnonce}"`;
  } else {
    resp = md5(`${ha1}:${ch.nonce}:${ha2}`);
  }
  let hdr = `Digest username="${user}", realm="${ch.realm}", nonce="${ch.nonce}", uri="${uri}", response="${resp}"${extra}`;
  if (ch.opaque) hdr += `, opaque="${ch.opaque}"`;
  return hdr;
}

function parseMediaUrls(bodyStr: string, debug = false): string[] {
  if (debug) console.log('[photo] Raw body (first 1000):\n', bodyStr.slice(0, 1000));

  const delimMatch = bodyStr.match(/DELIMITER value="(\d+)"/);
  const delim = delimMatch ? String.fromCharCode(parseInt(delimMatch[1], 10)) : '\t';

  const colMatch = bodyStr.match(/<COLUMNS>([\s\S]*?)<\/COLUMNS>/);
  const dataAll  = [...bodyStr.matchAll(/<DATA>([\s\S]*?)<\/DATA>/g)];

  if (!colMatch) { console.warn('[photo] No <COLUMNS> tag found'); return []; }
  if (dataAll.length === 0) { console.warn('[photo] No <DATA> rows found'); return []; }

  // Use raw (unfiltered) split so column indices match DATA row indices exactly.
  // RETS COMPACT lines start and end with the delimiter, so index 0 is always empty.
  const rawCols = colMatch[1].split(delim).map(c => c.trim());
  console.log('[photo] GetObject columns:', rawCols.filter(Boolean).join(' | '));

  const urlIdx = rawCols.findIndex(c => /mediaurl|location|url|objectdata/i.test(c));
  if (urlIdx === -1) {
    console.warn('[photo] No URL column found. Raw cols:', rawCols.join(', '));
    return [];
  }

  const urls: string[] = [];
  for (const dm of dataAll) {
    const vals = dm[1].split(delim).map(v => v.trim());
    const u = vals[urlIdx] ?? '';
    if (u.startsWith('http')) urls.push(u);
    else if (u.startsWith('//')) urls.push('https:' + u);
  }
  return urls;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export class DdfPhotoSession {
  private loginUrl: string;
  private user: string;
  private pass: string;
  private objectBase: string = '';
  private cookies: string = '';
  private challenge: Record<string, string> = {};
  private cnonce: string = '';
  private nc: number = 1; // nc=1 used for login

  constructor(loginUrl: string, username: string, password: string) {
    this.loginUrl = loginUrl;
    this.user = username;
    this.pass = password;
  }

  async login(): Promise<void> {
    const u = new URL(this.loginUrl);
    const loginUri = u.pathname;
    this.objectBase = `${u.protocol}//${u.host}/Object.svc/GetObject`;

    // Step 1 — get Digest challenge
    const r1 = await rawGet(this.loginUrl);
    if (r1.status !== 401) throw new Error(`Expected 401 from login, got ${r1.status}`);
    const wwwAuth = String(r1.headers['www-authenticate'] ?? '');
    if (!wwwAuth.toLowerCase().includes('digest')) throw new Error('No Digest challenge in 401');

    this.challenge = parseChallenge(wwwAuth);
    this.cnonce    = crypto.randomBytes(4).toString('hex');
    this.nc        = 1;

    // Step 2 — authenticated login
    const auth = buildDigest('GET', loginUri, this.challenge, this.user, this.pass, '00000001', this.cnonce);
    const r2   = await rawGet(this.loginUrl, { Authorization: auth });
    if (r2.status !== 200) throw new Error(`Login failed ${r2.status}: ${r2.body.slice(0, 200)}`);

    const rawCookies = ([] as string[]).concat(r2.headers['set-cookie'] ?? []);
    if (!rawCookies.length) throw new Error('No cookies in login response');
    this.cookies = rawCookies.map(c => c.split(';')[0]).join('; ');

    console.log(`[photo] Session ready. nonce=${this.challenge.nonce.slice(0, 20)}…`);
  }

  async fetchPhotoUrls(listingKey: string | number): Promise<string[]> {
    this.nc += 1;
    const ncStr = String(this.nc).padStart(8, '0');

    const objUrl = new URL(this.objectBase);
    objUrl.searchParams.set('Resource', 'Property');
    objUrl.searchParams.set('Type',     'LargePhoto');
    objUrl.searchParams.set('ID',       `${listingKey}:*`);
    const objUri = objUrl.pathname;

    const auth = buildDigest('GET', objUri, this.challenge, this.user, this.pass, ncStr, this.cnonce);
    const resp  = await rawGet(objUrl.toString(), { Cookie: this.cookies, Authorization: auth });

    if (resp.status === 401) {
      // Nonce expired — re-login and retry once
      console.log(`[photo] Nonce expired (401) — re-logging in…`);
      await this.login();
      return this.fetchPhotoUrls(listingKey);
    }

    if (resp.status !== 200) {
      throw new Error(`GetObject HTTP ${resp.status} for listing ${listingKey}`);
    }

    const bodyStr = resp.body.toString('utf8');
    const codeMatch = bodyStr.match(/ReplyCode="(\d+)"/);
    const code = codeMatch?.[1] ?? '0';

    if (code === '20701') {
      // Not logged in — session dropped, re-login and retry once
      console.log(`[photo] RETS 20701 (not logged in) — re-logging in…`);
      await this.login();
      return this.fetchPhotoUrls(listingKey);
    }

    // 20403 = No Object Found, 20400 = No Data Found — listing exists but has no photos
    if (code === '20403' || code === '20400') {
      return [];
    }

    if (code !== '0') {
      const text = bodyStr.match(/ReplyText="([^"]+)"/)?.[1] ?? 'unknown';
      throw new Error(`RETS error ${code}: ${text} for listing ${listingKey}`);
    }

    // debug=true for the first call so we can see the full column layout once
    const debug = this.nc === 2;
    return parseMediaUrls(bodyStr, debug);
  }
}
