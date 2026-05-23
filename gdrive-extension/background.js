// Service worker — saves captured listing photos + description.txt to Google Drive.
//
// SETUP REQUIRED before this extension works:
//   1. Google Cloud Console → new project → enable "Google Drive API"
//   2. APIs & Services → Credentials → Create OAuth 2.0 Client ID
//      Application type: Chrome Extension  |  Item ID: this extension's ID
//   3. Copy the generated client_id into manifest.json → "oauth2" → "client_id"

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'TOURIT_SAVE_TO_GDRIVE') {
    saveToDrive(msg.listing)
      .then(sendResponse)
      .catch((err) => {
        console.error('[Tourit GDrive]', err);
        sendResponse({ ok: false, error: err.message });
      });
    return true; // keep channel open for async response
  }
});

// ─── Orchestrator ─────────────────────────────────────────────────────────────

async function saveToDrive(listing) {
  const token = await getAuthToken();

  const folderName = listing.address
    ? `${listing.mls_number} - ${listing.address}`
    : listing.mls_number;

  const folderId = await createDriveFolder(token, folderName);

  await uploadTextFile(token, folderId, 'description.txt', buildDescriptionTxt(listing));

  const urls = (listing.images || []).slice(0, 20);
  let uploaded = 0;
  if (urls.length) {
    const images = await fetchImageBuffers(urls);
    for (const img of images) {
      await uploadImageFile(token, folderId, img);
      uploaded++;
    }
  }

  console.log(`[Tourit GDrive] Saved "${folderName}" — ${uploaded} photo(s)`);
  return { ok: true, folderId, folderName, photos: uploaded };
}

// ─── Google OAuth ─────────────────────────────────────────────────────────────

function getAuthToken() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!token) return reject(new Error('No auth token returned'));
      resolve(token);
    });
  });
}

// ─── Drive API helpers ────────────────────────────────────────────────────────

async function createDriveFolder(token, name) {
  const res = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder' }),
  });
  if (!res.ok) throw new Error(`Create folder failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.id;
}

async function uploadTextFile(token, folderId, filename, text) {
  const boundary = 'tourit_gdrive_boundary';
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify({ name: filename, parents: [folderId] }),
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    '',
    text,
    `--${boundary}--`,
  ].join('\r\n');

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );
  if (!res.ok) throw new Error(`Upload text failed: ${res.status} ${await res.text()}`);
}

async function uploadImageFile(token, folderId, img) {
  const boundary = 'tourit_gdrive_boundary';
  const metaJson = JSON.stringify({ name: img.name, parents: [folderId] });

  // Multipart body: JSON metadata part + raw binary image part
  const metaPart  = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaJson}\r\n--${boundary}\r\nContent-Type: ${img.mime}\r\n\r\n`;
  const endPart   = `\r\n--${boundary}--`;
  const metaBytes  = new TextEncoder().encode(metaPart);
  const imageBytes = new Uint8Array(img.data);
  const endBytes   = new TextEncoder().encode(endPart);

  const body = new Uint8Array(metaBytes.length + imageBytes.length + endBytes.length);
  body.set(metaBytes, 0);
  body.set(imageBytes, metaBytes.length);
  body.set(endBytes, metaBytes.length + imageBytes.length);

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );
  if (!res.ok) {
    console.warn('[Tourit GDrive] Image upload failed:', img.name, res.status, await res.text());
  }
}

// ─── Image fetching ───────────────────────────────────────────────────────────

async function fetchImageBuffers(urls) {
  const results = await Promise.all(
    urls.map((url) =>
      fetch(url, { credentials: 'omit', mode: 'cors' })
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.arrayBuffer();
        })
        .then((buf) => {
          const ext  = (url.split('?')[0].split('.').pop() || 'jpg').toLowerCase();
          const mime =
            ext === 'png'  ? 'image/png'  :
            ext === 'webp' ? 'image/webp' :
            ext === 'gif'  ? 'image/gif'  : 'image/jpeg';
          const name = url.split('/').pop().split('?')[0] || `photo.${ext}`;
          return { name, mime, data: Array.from(new Uint8Array(buf)) };
        })
        .catch((err) => {
          console.warn('[Tourit GDrive] Image fetch failed:', url, err.message);
          return null;
        })
    )
  );
  return results.filter(Boolean);
}

// ─── Description TXT ─────────────────────────────────────────────────────────

function buildDescriptionTxt(listing) {
  return [
    `MLS#:             ${listing.mls_number || ''}`,
    `Address:          ${listing.address || ''}`,
    `City:             ${listing.city || ''}`,
    `Price:            $${Number(listing.price || 0).toLocaleString()}`,
    `Beds:             ${listing.beds ?? ''}`,
    `Baths:            ${listing.baths ?? ''}`,
    `Property Type:    ${listing.property_type || ''}`,
    `Style:            ${listing.style || ''}`,
    `Transaction Type: ${listing.transaction_type || ''}`,
    '',
    '--- Description ---',
    listing.description || '(no description)',
  ].join('\n');
}
