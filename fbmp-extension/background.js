// Service worker — fetches images from Tourit/Supabase URLs and returns
// them as transferable ArrayBuffers so fbmp.js can reconstruct File objects.

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
          // Plain array survives structured-clone across MV3 message boundary
          return { name, mime, data: Array.from(new Uint8Array(buf)) };
        })
        .catch((err) => {
          console.warn('[Tourit FBMP] Image fetch failed:', url, err.message);
          return null;
        })
    )
  ).then((results) => {
    const images = results.filter(Boolean);
    console.log(`[Tourit FBMP] Fetched ${images.length}/${urls.length} images`);
    sendResponse({ images });
  });

  return true; // keep message channel open for async sendResponse
});
