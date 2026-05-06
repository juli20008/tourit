// Service worker — fetches images from Tourit/Supabase URLs and returns
// them as transferable ArrayBuffers so fbmp.js can reconstruct File objects.

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'TOURIT_FETCH_IMAGES') return false;

  const urls = Array.isArray(msg.urls) ? msg.urls.slice(0, 20) : [];

  Promise.all(
    urls.map((url) =>
      fetch(url, { credentials: 'omit' })
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.arrayBuffer();
        })
        .then((buf) => {
          const ext = (url.split('?')[0].split('.').pop() || 'jpg').toLowerCase();
          const mime =
            ext === 'png' ? 'image/png' :
            ext === 'webp' ? 'image/webp' :
            ext === 'gif' ? 'image/gif' : 'image/jpeg';
          const name = url.split('/').pop().split('?')[0] || `photo.${ext}`;
          // Convert to plain array so it survives structured-clone (MV3 restriction)
          return { name, mime, data: Array.from(new Uint8Array(buf)) };
        })
        .catch((err) => {
          console.warn('[Tourit FBMP] Could not fetch image:', url, err.message);
          return null;
        })
    )
  ).then((results) => {
    sendResponse({ images: results.filter(Boolean) });
  });

  return true; // keep message channel open for async sendResponse
});
