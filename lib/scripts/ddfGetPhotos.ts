/**
 * Fetches DDF listing photos via RETS GetObject (binary mode),
 * parses the multipart response, and uploads each image to Supabase Storage.
 *
 * Prerequisites:
 *   1. Create a Supabase Storage bucket called "ddf-photos" (set to public).
 *   2. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env.local.
 *
 * Run with:
 *   npx ts-node lib/scripts/ddfGetPhotos.ts
 */

import '../env';
import { getAutoLogoutClient } from 'rets-client';

const LISTING_KEY = '24159896';

// Try these type names in order until one works.
// LargePhoto is the documented CREA DDF type; others are fallbacks.
const PHOTO_TYPES = ['LargePhoto', 'Photo', 'HiRes', 'Thumbnail', 'ThumbnailPhoto'];

// ── Supabase Storage upload ───────────────────────────────────────────────────

async function uploadToStorage(
  supaUrl: string,
  supaKey: string,
  bucket: string,
  path: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const endpoint = `${supaUrl}/storage/v1/object/${bucket}/${path}`;
  // fetch body requires ArrayBuffer / Uint8Array — Buffer.buffer gives the
  // underlying ArrayBuffer but may include extra bytes; slice() makes it exact.
  const body = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  ) as ArrayBuffer;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      apikey: supaKey,
      Authorization: `Bearer ${supaKey}`,
      'Content-Type': contentType,
      'x-upsert': 'true',
    },
    body,
  });
  if (!res.ok) throw new Error(`Storage upload failed ${res.status}: ${await res.text()}`);
  // Public URL
  return `${supaUrl}/storage/v1/object/public/${bucket}/${path}`;
}

// ── Multipart parser ──────────────────────────────────────────────────────────
// CREA DDF separates photos with --creaboundary (or whatever boundary the
// server declares in Content-Type).  We parse headers + body per part.

interface Part {
  headers: Record<string, string>;
  body: Buffer;
}

function parseMultipart(raw: Buffer, boundary: string): Part[] {
  const sep   = Buffer.from(`--${boundary}`);
  const parts: Part[] = [];
  let   pos   = 0;

  while (pos < raw.length) {
    const sepIdx = raw.indexOf(sep, pos);
    if (sepIdx === -1) break;

    const afterSep = sepIdx + sep.length;
    // Skip CRLF after boundary line
    const headerStart = raw[afterSep] === 0x0d && raw[afterSep + 1] === 0x0a
      ? afterSep + 2
      : afterSep;

    // Find the blank line (CRLFCRLF) that separates headers from body
    const headerEnd = raw.indexOf(Buffer.from('\r\n\r\n'), headerStart);
    if (headerEnd === -1) { pos = afterSep; continue; }

    const headerBlock = raw.slice(headerStart, headerEnd).toString('utf8');
    const bodyStart   = headerEnd + 4;

    // Find next boundary to know where body ends
    const nextSepIdx = raw.indexOf(sep, bodyStart);
    const bodyEnd    = nextSepIdx === -1 ? raw.length : nextSepIdx - 2; // -2 strips trailing CRLF

    const headers: Record<string, string> = {};
    for (const line of headerBlock.split('\r\n')) {
      const colon = line.indexOf(':');
      if (colon > -1) {
        headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
      }
    }

    const body = raw.slice(bodyStart, bodyEnd);
    if (body.length > 0) parts.push({ headers, body });

    pos = nextSepIdx === -1 ? raw.length : nextSepIdx;
  }

  return parts;
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
    { loginUrl, username, password, version: 'RETS/1.7.2', userAgent: 'Tourit-GetObj/1.0' },
    async (rets: any) => {

      for (const photoType of PHOTO_TYPES) {
        console.log(`\n[ddf-photos] Trying GetObject Type="${photoType}" …`);

        let rawResponse: Buffer | null = null;
        let contentTypeHeader = '';

        try {
          // Use rets-client's low-level getObject which returns the raw stream/buffer.
          // ID format: "<ListingKey>:*"  — '*' means all photos.
          const resp = await rets.objects.getObject({
            Type:     photoType,
            Resource: 'Property',
            ID:       `${LISTING_KEY}:*`,
          });

          // rets-client may return a Buffer, a stream, or an object depending on version.
          if (Buffer.isBuffer(resp)) {
            rawResponse = resp;
          } else if (resp?.data && Buffer.isBuffer(resp.data)) {
            rawResponse = resp.data;
          } else if (resp?.body) {
            // Stream — collect into buffer
            const chunks: Buffer[] = [];
            for await (const chunk of resp.body) {
              chunks.push(Buffer.from(chunk));
            }
            rawResponse = Buffer.concat(chunks);
            contentTypeHeader = resp.headers?.['content-type'] ?? '';
          } else if (typeof resp?.pipe === 'function') {
            const chunks: Buffer[] = [];
            await new Promise<void>((resolve, reject) => {
              resp.on('data', (c: any) => chunks.push(Buffer.from(c)));
              resp.on('end', resolve);
              resp.on('error', reject);
            });
            rawResponse = Buffer.concat(chunks);
          }
        } catch (err: any) {
          console.log(`  ✗ ${err?.message ?? err}`);
          continue;
        }

        if (!rawResponse || rawResponse.length === 0) {
          console.log('  ✗ Empty response');
          continue;
        }

        console.log(`  ✓ Got ${rawResponse.length} bytes`);

        // ── Detect boundary from Content-Type header ───────────────────────────
        // Content-Type: multipart/parallel; boundary="creaboundary"
        const boundaryMatch = contentTypeHeader.match(/boundary="?([^";\s]+)"?/i);
        const boundary = boundaryMatch?.[1] ?? 'creaboundary';
        console.log(`  Boundary: "${boundary}"`);

        // ── Parse multipart ────────────────────────────────────────────────────
        const parts = parseMultipart(rawResponse, boundary);
        console.log(`  Parts found: ${parts.length}`);

        if (parts.length === 0) {
          // Maybe single image (not multipart)
          const contentType = contentTypeHeader || 'image/jpeg';
          if (contentType.startsWith('image/')) {
            parts.push({ headers: { 'content-type': contentType }, body: rawResponse });
          }
        }

        const bucket = 'ddf-photos';
        const uploadedUrls: string[] = [];

        for (let i = 0; i < parts.length; i++) {
          const { headers, body } = parts[i];
          const ct       = headers['content-type'] || 'image/jpeg';
          const ext      = ct.includes('png') ? 'png' : 'jpg';
          const filename = `${LISTING_KEY}/${photoType}_${i + 1}.${ext}`;

          console.log(`  Uploading part ${i + 1}: ${body.length} bytes (${ct}) → ${filename}`);

          try {
            const url = await uploadToStorage(supaUrl, supaKey, bucket, filename, body, ct);
            uploadedUrls.push(url);
            console.log(`    ✓ ${url}`);
          } catch (err: any) {
            console.error(`    ✗ Upload failed: ${err.message}`);
          }
        }

        if (uploadedUrls.length > 0) {
          console.log(`\n[ddf-photos] Uploaded ${uploadedUrls.length} image(s) ✓`);
          console.log('\nPublic URLs:');
          uploadedUrls.forEach(u => console.log(' ', u));
          return; // success — stop trying more types
        }
      }

      console.log('\n[ddf-photos] All types exhausted. No photos retrieved.');
      console.log('Check that the Supabase bucket "ddf-photos" exists and is public.');
    }
  );
}

main().catch(err => {
  console.error('[ddf-photos] FAILED:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
