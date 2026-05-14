// Service worker — fetches images from Tourit/CDN URLs for the FBMP fill pipeline.
// account_key is set by content/tourit.js when an agent logs in to tourit.ca.

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'TOURIT_FETCH_IMAGES') return false;

  const urls = Array.isArray(msg.urls) ? msg.urls.slice(0, 20) : [];
  if (!urls.length) { sendResponse({ images: [] }); return true; }

  Promise.all(
    urls.map((url) =>
      fetch(url, { credentials: 'omit', mode: 'cors' })
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.arrayBuffer();
        })
        .then((buf) => {
          const ext = (url.split('?')[0].split('.').pop() || 'jpg').toLowerCase();
          const mime =
            ext === 'png'  ? 'image/png'  :
            ext === 'webp' ? 'image/webp' :
            ext === 'gif'  ? 'image/gif'  : 'image/jpeg';
          const name = url.split('/').pop().split('?')[0] || `photo.${ext}`;
          return { name, mime, data: Array.from(new Uint8Array(buf)) };
        })
        .catch((err) => {
          console.warn('[Tourit FBMP] Image fetch failed:', url, err.message);
          return null;
        })
    )
  ).then((results) => {
    sendResponse({ images: results.filter(Boolean) });
  });

  return true;
});
