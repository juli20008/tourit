// Service worker — image fetching + open XHS tab

const XHS_URL = 'https://creator.xiaohongshu.com/publish/publish?source=official&from=tab_switch&target=image';

// account_key is set by content/tourit.js when an agent logs in to tourit.ca

// ── Message listener ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {

  // ── CDN fetch (tourit.ca listings) ────────────────────────────────────────
  if (msg.type === 'TOURIT_FETCH_IMAGES') {
    const urls = Array.isArray(msg.urls) ? msg.urls.slice(0, 18) : [];
    if (!urls.length) { sendResponse({ images: [], errors: [] }); return true; }

    console.log('[Tourit XHS] Fetching', urls.length, 'CDN image(s)');

    Promise.all(
      urls.map((url) =>
        fetch(url, { credentials: 'omit' })
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
            return { ok: true, name, mime, data: Array.from(new Uint8Array(buf)) };
          })
          .catch((err) => {
            console.warn('[Tourit XHS] Fetch failed:', url, err.message);
            return { ok: false, error: `${url.split('/').pop()?.split('?')[0]?.slice(0, 30) ?? url.slice(0, 40)}: ${err.message}` };
          })
      )
    ).then((results) => {
      const images = results.filter(r => r.ok);
      const errors = results.filter(r => !r.ok).map(r => r.error);
      console.log(`[Tourit XHS] Fetched ${images.length}/${urls.length} images`);
      if (errors.length) console.warn('[Tourit XHS] Errors:', errors);
      sendResponse({ images, errors });
    });

    return true; // async response
  }

  // ── Desktop decode (local folder uploads) ────────────────────────────────
  if (msg.type === 'TOURIT_FETCH_DESKTOP_IMAGES') {
    chrome.storage.local.get('tourit_listing', ({ tourit_listing: listing }) => {
      if (!listing || listing.source !== 'desktop' || !listing.images?.length) {
        sendResponse({ images: [], errors: ['图片数据不可用，请重新从桌面上传。'] });
        return;
      }

      const images = [];
      const errors = [];

      for (const [i, dataURL] of listing.images.entries()) {
        try {
          const comma  = dataURL.indexOf(',');
          const header = dataURL.slice(0, comma);
          const b64    = dataURL.slice(comma + 1);
          const mime   = (header.match(/:(.*?);/) || ['', 'image/jpeg'])[1];
          const ext    = mime.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
          const binary = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
          images.push({
            ok:   true,
            name: `photo_${String(i + 1).padStart(2, '0')}.${ext}`,
            mime,
            data: Array.from(binary),
          });
        } catch (e) {
          console.warn(`[Tourit XHS] Desktop image ${i + 1} decode failed:`, e.message);
          errors.push(`图片 ${i + 1}: ${e.message}`);
        }
      }

      console.log(`[Tourit XHS] Desktop images ready: ${images.length} prepared`);
      sendResponse({ images, errors });
    });

    return true; // async response
  }

  // ── Translation (en → zh-CN via Google Translate free endpoint) ─────────
  if (msg.type === 'TOURIT_TRANSLATE') {
    const text = (msg.text || '').trim();
    if (!text) { sendResponse({ text: '' }); return false; }

    const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q='
      + encodeURIComponent(text.slice(0, 3000));

    fetch(url)
      .then(r => r.json())
      .then(data => {
        const translated = (data[0] || []).map(c => c[0] || '').join('');
        sendResponse({ text: translated });
      })
      .catch(err => {
        console.warn('[Tourit XHS] Translation failed:', err.message);
        sendResponse({ text: '', error: err.message });
      });

    return true; // async response
  }

  // ── AI rewrite via Tourit backend ─────────────────────────────────────────
  if (msg.type === 'TOURIT_CLAUDE_REWRITE') {
    const { listing, city_zh, type_zh, translated_desc, device_id } = msg;

    if (!device_id) {
      sendResponse({ error: 'not_logged_in' });
      return true;
    }

    fetch('https://api.tourit.ca/api/xhs/rewrite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listing, city_zh, type_zh, translated_desc, device_id: device_id || '' }),
    })
      .then(async (r) => {
        if (r.status === 402) {
          const data = await r.json();
          sendResponse({ error: 'no_credits', ...data });
          return;
        }
        const data = await r.json();
        sendResponse({ text: data.text || '' });
      })
      .catch(e => {
        console.warn('[Tourit XHS] rewrite failed:', e.message);
        sendResponse({ text: '', error: e.message });
      });

    return true; // async response
  }

  if (msg.type === 'TOURIT_OPEN_XHS') {
    chrome.tabs.create({ url: XHS_URL });
    return false;
  }
});
