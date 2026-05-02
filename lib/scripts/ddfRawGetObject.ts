/**
 * Fetches DDF listing photos via raw HTTPS — no rets-client wrapper.
 * Flow:
 *   1. GET Login URL → 401 + Digest challenge
 *   2. Compute Digest response, re-GET Login → 200 + Set-Cookie: SESSIONID
 *   3. GET GetObject with Cookie: SESSIONID — returns multipart binary stream
 *   4. Parse --creaboundary multipart parts
 *   5. Upload each image to Supabase Storage
 *
 * Run with:
 *   npx ts-node lib/scripts/ddfRawGetObject.ts
 */

import '../env';
import * as https from 'https';
import * as crypto from 'crypto';

// ─── Config ───────────────────────────────────────────────────────────────────
const DDF_LOGIN_URL  = process.env.DDF_LOGIN_URL!;   // e.g. https://data.crea.ca/Login.svc/Login
const DDF_USERNAME   = process.env.DDF_USERNAME!;
const DDF_PASSWORD   = process.env.DDF_PASSWORD!;
const SUPABASE_URL   = process.env.SUPABASE_URL!;
const SUPABASE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const LISTING_KEY    = process.argv.find(a => a.startsWith('--mls='))?.split('=')[1] ?? '24159896';
const PHOTO_TYPE     = 'LargePhoto';
const BUCKET         = 'ddf-photos';

// Derive GetObject URL from the login URL (same host, different path).
function getObjectUrl(): string {
  const u = new URL(DDF_LOGIN_URL);
  return `${u.protocol}//${u.host}/Object.svc/GetObject`;
}

// ─── MD5 / Digest auth ────────────────────────────────────────────────────────
const md5 = (s: string) => crypto.createHash('md5').update(s).digest('hex');

function parseDigestChallenge(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  // quoted values
  for (const m of header.matchAll(/(\w+)="([^"]+)"/g)) out[m[1]] = m[2];
  // unquoted values (e.g. algorithm=MD5)
  for (const m of header.matchAll(/(\w+)=([^",\s]+)/g)) if (!out[m[1]]) out[m[1]] = m[2];
  return out;
}

function buildDigestHeader(
  method: string,
  uri: string,
  ch: Record<string, string>,
  nc = '00000001',
  cnonce = crypto.randomBytes(4).toString('hex'),
): string {
  const ha1 = md5(`${DDF_USERNAME}:${ch.realm}:${DDF_PASSWORD}`);
  const ha2  = md5(`${method}:${uri}`);

  let response: string;
  let extra = '';

  if (ch.qop) {
    response = md5(`${ha1}:${ch.nonce}:${nc}:${cnonce}:${ch.qop}:${ha2}`);
    extra = `, qop=${ch.qop}, nc=${nc}, cnonce="${cnonce}"`;
  } else {
    response = md5(`${ha1}:${ch.nonce}:${ha2}`);
  }

  let hdr = `Digest username="${DDF_USERNAME}", realm="${ch.realm}", nonce="${ch.nonce}", uri="${uri}", response="${response}"${extra}`;
  if (ch.opaque) hdr += `, opaque="${ch.opaque}"`;
  return hdr;
}

// ─── Raw HTTPS request ────────────────────────────────────────────────────────
type RawResponse = { status: number; headers: Record<string, string | string[]>; body: Buffer };

function rawGet(urlStr: string, extraHeaders: Record<string, string> = {}): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const options = {
      hostname: u.hostname,
      path:     u.pathname + u.search,
      method:   'GET',
      headers:  {
        'User-Agent':      'Tourit/1.0 RETS-Client/4.x',
        'Accept':          '*/*',
        'RETS-Version':    'RETS/1.7.2',
        ...extraHeaders,
      },
    };

    const req = https.request(options, res => {
      const chunks: Buffer[] = [];
      res.on('data', c => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      res.on('end', () => resolve({
        status:  res.statusCode!,
        headers: res.headers as Record<string, string | string[]>,
        body:    Buffer.concat(chunks),
      }));
    });
    req.on('error', reject);
    req.end();
  });
}

interface LoginResult {
  cookie:    string;                    // full "Name=value" cookie string
  allCookies: string;                   // all cookies joined for Cookie header
  challenge: Record<string, string>;   // original Digest challenge from login
  cnonce:    string;                    // cnonce used for login (so nc can increment)
}

// ─── RETS Digest login → returns session info ─────────────────────────────────
async function retsLogin(): Promise<LoginResult> {
  const loginUri = new URL(DDF_LOGIN_URL).pathname;

  // Step 1 — unauthenticated request to obtain the Digest challenge
  const step1 = await rawGet(DDF_LOGIN_URL);
  if (step1.status !== 401) throw new Error(`Expected 401, got ${step1.status}`);

  const wwwAuth = String(step1.headers['www-authenticate'] ?? '');
  if (!wwwAuth.toLowerCase().includes('digest')) throw new Error('No Digest challenge in response');

  const challenge = parseDigestChallenge(wwwAuth);
  console.log(`[auth] realm="${challenge.realm}"  nonce="${challenge.nonce}"`);

  // Step 2 — authenticated login (save cnonce so we can reuse it)
  const cnonce    = crypto.randomBytes(4).toString('hex');
  const authHeader = buildDigestHeader('GET', loginUri, challenge, '00000001', cnonce);
  const step2 = await rawGet(DDF_LOGIN_URL, { Authorization: authHeader });

  if (step2.status !== 200) {
    throw new Error(`Login failed ${step2.status}: ${step2.body.slice(0, 300).toString()}`);
  }

  console.log('[auth] Login response headers:', JSON.stringify(step2.headers, null, 2));
  console.log('[auth] Login response body (first 600):', step2.body.slice(0, 600).toString());

  // Collect ALL cookies (not just SESSIONID) — send all of them downstream
  const rawCookies = ([] as string[]).concat(step2.headers['set-cookie'] ?? []);
  console.log('[auth] All Set-Cookie headers:', rawCookies);

  if (rawCookies.length === 0) throw new Error('No Set-Cookie in login response');

  const cookiePairs = rawCookies.map(c => c.split(';')[0]); // "Name=value" for each
  const allCookies  = cookiePairs.join('; ');
  const sessionId   = cookiePairs.find(c => /SESSIONID|asp\.net/i.test(c)) ?? cookiePairs[0];

  console.log(`[auth] Sending cookies: ${allCookies}`);
  return { cookie: sessionId, allCookies, challenge, cnonce };
}

// ─── Multipart parser (binary-safe) ──────────────────────────────────────────
interface Part { headers: Record<string, string>; body: Buffer }

function parseMultipart(raw: Buffer, boundary: string): Part[] {
  const sep   = Buffer.from(`--${boundary}`);
  const CRLF  = Buffer.from('\r\n');
  const DBLCR = Buffer.from('\r\n\r\n');
  const parts: Part[] = [];
  let pos = 0;

  while (pos < raw.length) {
    const sepIdx = raw.indexOf(sep, pos);
    if (sepIdx === -1) break;

    const afterSep = sepIdx + sep.length;
    // Skip the CRLF following the boundary line
    const headerStart = (raw[afterSep] === 0x0d && raw[afterSep + 1] === 0x0a)
      ? afterSep + 2 : afterSep;

    const headerEnd = raw.indexOf(DBLCR, headerStart);
    if (headerEnd === -1) { pos = afterSep; continue; }

    const headerBlock = raw.slice(headerStart, headerEnd).toString('utf8');
    const bodyStart   = headerEnd + 4;
    const nextSep     = raw.indexOf(sep, bodyStart);
    const bodyEnd     = nextSep === -1 ? raw.length : nextSep - 2; // strip trailing CRLF

    const headers: Record<string, string> = {};
    for (const line of headerBlock.split('\r\n')) {
      const colon = line.indexOf(':');
      if (colon > -1) headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
    }

    const body = raw.slice(bodyStart, bodyEnd);
    if (body.length > 0) parts.push({ headers, body });

    pos = nextSep === -1 ? raw.length : nextSep;
  }

  return parts;
}

// ─── Supabase Storage upload ──────────────────────────────────────────────────
async function uploadImage(path: string, body: Buffer, contentType: string): Promise<string> {
  const endpoint = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`;
  // fetch requires ArrayBuffer — slice ensures we don't pass a shared backing buffer
  const ab = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      apikey:          SUPABASE_KEY,
      Authorization:   `Bearer ${SUPABASE_KEY}`,
      'Content-Type':  contentType,
      'x-upsert':      'true',
    },
    body: ab,
  });
  if (!res.ok) throw new Error(`Storage upload ${res.status}: ${await res.text()}`);
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  if (!DDF_LOGIN_URL || !DDF_USERNAME || !DDF_PASSWORD || !SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Missing env vars');
  }

  // 1. Login → session + original challenge
  const { allCookies, challenge: loginChallenge, cnonce: loginCnonce } = await retsLogin();

  // 2. Build GetObject URL
  const objUrl = new URL(getObjectUrl());
  objUrl.searchParams.set('Resource', 'Property');
  objUrl.searchParams.set('Type',     PHOTO_TYPE);
  objUrl.searchParams.set('ID',       `${LISTING_KEY}:*`);

  const objUrlStr = objUrl.toString();
  const objUri    = new URL(objUrlStr).pathname;
  console.log(`\n[getobj] GET ${objUrlStr}`);

  // Attempt A — reuse the LOGIN nonce for GetObject (nc=2, same cnonce)
  // Many RETS servers track "logged in" per Digest nonce context.
  const authA = buildDigestHeader('GET', objUri, loginChallenge, '00000002', loginCnonce);
  let resp = await rawGet(objUrlStr, { Cookie: allCookies, Authorization: authA });
  console.log(`[getobj] Attempt-A (login nonce nc=2): ${resp.status}  ${resp.body.length} bytes`);

  if (resp.status === 401 || (resp.status === 200 && resp.body.toString().includes('20701'))) {
    // Attempt B — fresh challenge from Object endpoint + session cookie
    const wwwAuth2 = String(resp.headers['www-authenticate'] ?? '');
    console.log('[getobj] Attempt-A failed — trying fresh Object challenge…');
    if (wwwAuth2.toLowerCase().includes('digest')) {
      const ch2   = parseDigestChallenge(wwwAuth2);
      console.log(`[getobj] Object nonce="${ch2.nonce}" (login was "${loginChallenge.nonce}")`);
      const authB = buildDigestHeader('GET', objUri, ch2);
      resp = await rawGet(objUrlStr, { Cookie: allCookies, Authorization: authB });
      console.log(`[getobj] Attempt-B (fresh Object nonce): ${resp.status}  ${resp.body.length} bytes`);
    } else {
      // No Digest challenge in 401 body — try fetching a challenge first
      console.log('[getobj] Getting challenge from Object endpoint (no-auth probe)…');
      const probe = await rawGet(objUrlStr, {});
      const wwwAuth3 = String(probe.headers['www-authenticate'] ?? '');
      if (wwwAuth3.toLowerCase().includes('digest')) {
        const ch3   = parseDigestChallenge(wwwAuth3);
        const authC = buildDigestHeader('GET', objUri, ch3);
        resp = await rawGet(objUrlStr, { Cookie: allCookies, Authorization: authC });
        console.log(`[getobj] Attempt-C (probe+fresh nonce): ${resp.status}  ${resp.body.length} bytes`);
      }
    }
  }

  console.log(`[getobj] Content-Type: ${resp.headers['content-type']}`);

  if (resp.status !== 200) {
    console.error('[getobj] Error body:', resp.body.toString());
    return;
  }

  // 3. Branch on response format
  const ct = String(resp.headers['content-type'] ?? '');
  console.log(`[getobj] Content-Type: ${ct}`);
  console.log(`[getobj] Full body:\n${resp.body.toString()}`);

  const parts: Part[] = [];

  if (ct.includes('multipart')) {
    // ── Binary multipart (expected normal path) ──────────────────────────────
    const bMatch   = ct.match(/boundary="?([^";\s]+)"?/i);
    const boundary = bMatch?.[1] ?? 'creaboundary';
    console.log(`[getobj] Multipart boundary: "${boundary}"`);
    parts.push(...parseMultipart(resp.body, boundary));
    console.log(`[getobj] Parts found: ${parts.length}`);

  } else if (ct.includes('text/xml') || ct.includes('application/xml')) {
    // ── COMPACT / XML response — parse COLUMNS + DATA ────────────────────────
    const bodyStr = resp.body.toString('utf8');
    const delimMatch = bodyStr.match(/DELIMITER value="(\d+)"/);
    const delim = delimMatch ? String.fromCharCode(parseInt(delimMatch[1], 10)) : '\t';

    const colMatch  = bodyStr.match(/<COLUMNS>([\s\S]*?)<\/COLUMNS>/);
    const dataMatches = [...bodyStr.matchAll(/<DATA>([\s\S]*?)<\/DATA>/g)];

    if (colMatch && dataMatches.length > 0) {
      const cols = colMatch[1].split(delim).map(c => c.trim()).filter(Boolean);
      console.log(`[getobj] COMPACT columns: ${cols.join(', ')}`);
      for (const dm of dataMatches) {
        const vals = dm[1].split(delim).map(v => v.trim());
        const row: Record<string, string> = {};
        cols.forEach((c, i) => { row[c] = vals[i] ?? ''; });
        console.log('[getobj] DATA row:', JSON.stringify(row, null, 2));
        // If there's a Location / URL column, log it prominently
        for (const [k, v] of Object.entries(row)) {
          if (v && (v.startsWith('http') || /location|url|uri/i.test(k))) {
            console.log(`  *** ${k}: ${v}`);
          }
        }
      }
    } else {
      console.log('[getobj] Could not parse COLUMNS/DATA from XML response');
    }
    return;  // nothing to upload from metadata-only response

  } else if (ct.startsWith('image/')) {
    console.log('[getobj] Single image (not multipart) — uploading directly');
    parts.push({ headers: { 'content-type': ct }, body: resp.body });
  } else {
    console.log('[getobj] Unrecognised Content-Type — cannot process');
    return;
  }

  // 5. Upload
  const urls: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const { headers, body } = parts[i];
    const imgType = headers['content-type'] || 'image/jpeg';
    const ext     = imgType.includes('png') ? 'png' : 'jpg';
    const path    = `${LISTING_KEY}/${i + 1}.${ext}`;

    process.stdout.write(`  Uploading part ${i + 1}/${parts.length} (${body.length} bytes)… `);
    try {
      const url = await uploadImage(path, body, imgType);
      urls.push(url);
      console.log('✓');
    } catch (e: any) {
      console.log(`✗ ${e.message}`);
    }
  }

  console.log(`\n[done] ${urls.length} image(s) uploaded:`);
  urls.forEach(u => console.log(' ', u));
}

main().catch(err => {
  console.error('FAILED:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
