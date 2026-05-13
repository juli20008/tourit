// Runs on creator.xiaohongshu.com/publish/publish
//
// XHS two-step flow:
//
//   STEP 1 — large grey drop zone with red "上传图片" button
//     We intercept the hidden <input type="file"> click so we can inject
//     all listing photos at once without opening the native file dialog.
//
//   STEP 2 — title + body editor appears after 下一步
//     Auto-fills title and body.
//
// Source variants:
//   listing.source === 'desktop'  → images are base64 JPEG data-URLs stored
//                                   in chrome.storage; no background fetch needed.
//   (anything else)               → images are CDN URLs; fetch via background SW.

(() => {
  if (window.__touritXhsLoaded) return;
  window.__touritXhsLoaded = true;

  const PANEL_ID   = 'tourit-xhs-panel';
  const MAX_PHOTOS = 18;

  // ── Selectors ─────────────────────────────────────────────────────────────
  const SEL = {
    thumbImg: 'img[src^="blob:"]',
    dropZone: '.drag-over',
    title:    'input[placeholder*="标题"]',
    body:     '[contenteditable="true"].tiptap',
  };

  // ── Boot ──────────────────────────────────────────────────────────────────

  chrome.storage.local.get('tourit_listing', ({ tourit_listing: listing }) => {
    if (!listing) {
      showStatus('没有已抓取的房源。\n请先在 tourit.ca 上打开一个房源，或通过插件弹窗从桌面上传。', 'warn');
      return;
    }
    detectAndRender(listing);
    watchForStep2(listing);
  });

  // ── Step detection ────────────────────────────────────────────────────────

  function isOnStep2() { return !!findFirst(SEL.title); }

  function detectAndRender(listing) {
    isOnStep2() ? showStep2Panel(listing) : showStep1Panel(listing);
  }

  function watchForStep2(listing) {
    let onStep2 = isOnStep2();
    const mo = new MutationObserver(() => {
      const now = isOnStep2();
      if (now && !onStep2) { onStep2 = true; showStep2Panel(listing); }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  // ── Step 1 panel ──────────────────────────────────────────────────────────

  function showStep1Panel(listing) {
    const count = Math.min((listing.images || []).length, MAX_PHOTOS);
    const panel = ensurePanel();
    panel.dataset.tone = 'step1';
    panel.innerHTML = `
      <strong>Tourit → 小红书</strong>
      <div class="t-step">① 上传图片</div>
      <div class="t-address">${esc(listing.title || listing.address || listing.mls_number)}</div>
      <div class="t-meta">${listing.source === 'desktop' ? '📁 桌面上传' : `${listing.beds ?? '?'}床 · ${listing.baths ?? '?'}卫 · $${fmt(listing.price)}/月`}</div>
      <div class="t-imgs">${count} 张图片（最多 ${MAX_PHOTOS} 张）</div>
      <button id="tourit-xhs-upload-btn">上传全部图片</button>
      <div id="tourit-xhs-progress"></div>
    `;
    id('tourit-xhs-upload-btn').addEventListener('click', () => runStep1(listing));
  }

  async function runStep1(listing) {
    const btn = id('tourit-xhs-upload-btn');
    if (btn) btn.disabled = true;

    let files;

    if (listing.source === 'desktop') {
      // ── Desktop: images are base64 data-URLs, convert to File objects ──────
      const dataURLs = (listing.images || []).slice(0, MAX_PHOTOS);
      if (!dataURLs.length) {
        setProgress('⚠ 没有图片数据，请重新从桌面上传。');
        if (btn) btn.disabled = false;
        return;
      }
      setProgress(`从本地读取 ${dataURLs.length} 张图片…`);
      files = dataURLs.map((dataURL, i) => {
        try {
          const comma  = dataURL.indexOf(',');
          const header = dataURL.slice(0, comma);
          const b64    = dataURL.slice(comma + 1);
          const mime   = (header.match(/:(.*?);/) || ['', 'image/jpeg'])[1];
          const ext    = mime.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
          const bin    = atob(b64);
          const arr    = new Uint8Array(bin.length);
          for (let j = 0; j < bin.length; j++) arr[j] = bin.charCodeAt(j);
          return new File([arr], `photo_${String(i + 1).padStart(2, '0')}.${ext}`, { type: mime });
        } catch { return null; }
      }).filter(Boolean);
      setProgress(`已准备 ${files.length} 张图片，正在注入…`);
      await sleep(300);

    } else {
      // ── CDN: fetch via background service worker ───────────────────────────
      const urls = (listing.images || []).slice(0, MAX_PHOTOS);
      if (!urls.length) {
        setProgress('⚠ listing.images 为空，此房源没有图片数据。');
        if (btn) btn.disabled = false;
        return;
      }
      const sample = urls[0].length > 55 ? '…' + urls[0].slice(-45) : urls[0];
      setProgress(`找到 ${urls.length} 张图片\n${sample}`);
      await sleep(1000);

      setProgress(`正在下载 ${urls.length} 张图片…`);
      const { files: fetched, errors } = await fetchImages(urls);
      files = fetched;

      if (!files.length) {
        setProgress(`⚠ 下载失败\n${errors[0] || '未知错误'}`);
        if (btn) btn.disabled = false;
        return;
      }
      if (errors.length) {
        setProgress(`下载 ${files.length}/${urls.length} 张，继续…`);
        await sleep(600);
      }
    }

    // ── Inject into XHS (same path for both sources) ─────────────────────────
    setProgress(`注入 ${files.length} 张图片…`);
    const ok = await injectViaUploadBtn(files);

    if (!ok) {
      setProgress('按钮拦截失败，尝试拖拽注入…');
      await sleep(300);
      const dropOk = await injectViaDrop(files);
      if (!dropOk) {
        setProgress('⚠ 自动注入失败，请手动将图片拖入上传区域。');
        if (btn) btn.disabled = false;
        return;
      }
    }

    setProgress('等待预览加载…');
    await waitForThumbs();
    const thumbCount = document.querySelectorAll(SEL.thumbImg).length;
    setProgress(`✓ ${thumbCount} 张图片已上传\n请点击小红书的「下一步」按钮。`);
    if (btn) btn.disabled = false;
  }

  // ── Step 2 panel ──────────────────────────────────────────────────────────

  function showStep2Panel(listing) {
    const panel = ensurePanel();
    panel.dataset.tone = 'step2';
    panel.innerHTML = `
      <strong>Tourit → 小红书</strong>
      <div class="t-step">② 填写标题和正文</div>
      <div class="t-address">${esc(listing.title || listing.address || listing.mls_number)}</div>
      <button id="tourit-xhs-fill-btn">一键填写</button>
      <div id="tourit-xhs-progress"></div>
    `;
    id('tourit-xhs-fill-btn').addEventListener('click', () => runStep2(listing));
    setTimeout(() => runStep2(listing), 1200);
  }

  async function runStep2(listing) {
    const btn = id('tourit-xhs-fill-btn');
    if (btn) btn.disabled = true;

    setProgress('填写标题…');
    const titleOk = await fillTitle(listing);
    await sleep(400);

    setProgress('填写正文…');
    const bodyOk = await fillBody(listing);
    await sleep(300);

    setProgress([
      titleOk ? '✓ 标题' : '⚠ 标题框未找到',
      bodyOk  ? '✓ 正文' : '⚠ 正文框未找到',
    ].join('  ') + '\n请检查后手动点击发布。');

    if (btn) btn.disabled = false;
  }

  // ── Image fetching (background service worker, CDN only) ──────────────────

  function fetchImages(urls) {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'TOURIT_FETCH_IMAGES', urls }, resp => {
        if (chrome.runtime.lastError) {
          const msg = chrome.runtime.lastError.message || '消息发送失败';
          console.error('[xhs] sendMessage error:', msg);
          return resolve({ files: [], errors: [`消息错误: ${msg}`] });
        }
        if (!resp) return resolve({ files: [], errors: ['background 无响应'] });

        const files = (resp.images || []).map(img => {
          try {
            return new File(
              [new Blob([new Uint8Array(img.data)], { type: img.mime })],
              img.name, { type: img.mime }
            );
          } catch { return null; }
        }).filter(Boolean);

        resolve({ files, errors: resp.errors || [] });
      });
    });
  }

  // ── Injection strategy A: intercept "上传图片" button → hidden input ───────

  async function injectViaUploadBtn(files) {
    const trigger = await waitFor(() =>
      [...document.querySelectorAll('button')]
        .filter(isVisible)
        .find(el => (el.textContent || '').trim() === '上传图片') || null
    , 5000, 200);

    if (!trigger) { console.warn('[xhs] "上传图片" button not found'); return false; }

    return new Promise(resolve => {
      let done = false;
      const origClick = HTMLInputElement.prototype.click;

      HTMLInputElement.prototype.click = function () {
        if (this.type === 'file' && !done) {
          done = true;
          HTMLInputElement.prototype.click = origClick;

          const dt = new DataTransfer();
          for (const f of files) dt.items.add(f);
          this.files = dt.files;
          this.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
          this.dispatchEvent(new Event('input',  { bubbles: true, cancelable: true }));
          resolve(true);
          return;
        }
        origClick.call(this);
      };

      setTimeout(() => {
        if (!done) { HTMLInputElement.prototype.click = origClick; resolve(false); }
      }, 4000);

      trigger.click();
    });
  }

  // ── Injection strategy B: drag-and-drop simulation ────────────────────────

  async function injectViaDrop(files) {
    const zone = await waitFor(() =>
      document.querySelector(SEL.dropZone) ||
      [...document.querySelectorAll('div')]
        .filter(isVisible)
        .find(el => (el.textContent || '').includes('上传图片，或写文字生成图片')) ||
      null
    , 3000, 200);

    if (!zone) return false;

    const dt = new DataTransfer();
    for (const f of files) dt.items.add(f);

    zone.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt }));
    await sleep(50);
    zone.dispatchEvent(new DragEvent('dragover',  { bubbles: true, cancelable: true, dataTransfer: dt }));
    await sleep(50);
    zone.dispatchEvent(new DragEvent('drop',      { bubbles: true, cancelable: true, dataTransfer: dt }));
    return true;
  }

  async function waitForThumbs() {
    for (let i = 0; i < 24; i++) {
      if (document.querySelector(SEL.thumbImg)) return;
      await sleep(500);
    }
  }

  // ── Title / body fill ─────────────────────────────────────────────────────

  async function fillTitle(listing) {
    const el = await waitFor(() => findFirst(SEL.title), 5000, 200);
    if (!el) return false;
    const rawMax = parseInt(el.getAttribute('maxlength') || '', 10);
    const max = rawMax > 0 ? rawMax : 20;
    setReactValue(el, buildTitle(listing).slice(0, max));
    return true;
  }

  async function fillBody(listing) {
    const el = await waitFor(() => {
      const found = findFirst(SEL.body);
      if (found) return found;
      return [...document.querySelectorAll('[contenteditable="true"]')]
        .filter(isVisible)
        .sort((a, b) => {
          const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
          return (rb.width * rb.height) - (ra.width * ra.height);
        })[0] || null;
    }, 5000, 200);
    if (!el) return false;
    el.focus();
    document.execCommand('selectAll', false);
    const ok = document.execCommand('insertText', false, buildBody(listing));
    if (!ok) {
      el.textContent = buildBody(listing);
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  // ── Content builders ───────────────────────────────────────────────────────

  function buildTitle(listing) {
    if (listing.source === 'desktop') {
      return (listing.title || '').slice(0, 20);
    }
    const city = listing.city || '';
    return `${city} ${listing.beds ?? ''}床${listing.baths ?? '?'}卫 $${fmt(listing.price)}/月`.trim().slice(0, 20);
  }

  function buildBody(listing) {
    if (listing.source === 'desktop') {
      return (listing.description || '').trim();
    }
    const city = listing.city || '';
    return [
      `📍 ${listing.address || ''}${city ? ', ' + city : ''}`,
      `💰 月租：$${fmt(listing.price)}`,
      `🛏 卧室：${listing.beds ?? ''} 间`,
      `🚿 卫生间：${listing.baths ?? ''} 间`,
      listing.property_type ? `🏡 类型：${listing.property_type}` : null,
      '',
      listing.description || '',
      '',
      `MLS# ${listing.mls_number || ''}`,
      '',
      `#多伦多租房 ${city ? '#' + city.replace(/\s/g, '') + '租房 ' : ''}#加拿大房产 #海外走房 #多伦多房产`,
    ].filter(l => l !== null).join('\n').trim();
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function findFirst(selectors) {
    for (const sel of selectors.split(',').map(s => s.trim())) {
      const el = document.querySelector(sel);
      if (el && isVisible(el)) return el;
    }
    return null;
  }

  function setReactValue(el, value) {
    const proto  = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    setter ? setter.call(el, value) : (el.value = value);
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function isVisible(el) {
    if (!(el instanceof HTMLElement)) return false;
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
  }

  function sleep(ms)   { return new Promise(r => setTimeout(r, ms)); }
  function id(i)       { return document.getElementById(i); }
  function fmt(price)  { return Number(price || 0).toLocaleString(); }
  function esc(v)      { return String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  async function waitFor(fn, ms, interval) {
    const end = Date.now() + ms;
    while (Date.now() < end) { const v = fn(); if (v) return v; await sleep(interval); }
    return null;
  }

  function setProgress(msg) {
    const el = id('tourit-xhs-progress');
    if (el) el.textContent = msg;
  }

  // ── Panel ──────────────────────────────────────────────────────────────────

  function ensurePanel() {
    let panel = id(PANEL_ID);
    if (panel) return panel;

    panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.style.cssText = [
      'position:fixed', 'top:16px', 'right:16px', 'z-index:2147483647',
      'min-width:248px', 'max-width:320px', 'padding:14px 16px',
      'border-radius:14px', 'background:#1e293b', 'color:#f8fafc',
      'box-shadow:0 12px 40px rgba(0,0,0,0.45)',
      "font:13px/1.5 'Inter',system-ui,sans-serif",
      'border:1px solid #334155',
    ].join(';');

    const style = document.createElement('style');
    style.textContent = `
      #${PANEL_ID}[data-tone="warn"]  { background:#78350f; border-color:#92400e; }
      #${PANEL_ID}[data-tone="step2"] { border-color:#ff2442; }
      #${PANEL_ID} strong { display:block; margin-bottom:6px; font-size:14px; }
      #${PANEL_ID} .t-step { font-size:10px; color:#ff2442; font-weight:700; letter-spacing:.08em; text-transform:uppercase; margin-bottom:4px; }
      #${PANEL_ID} .t-address { font-weight:600; font-size:13px; }
      #${PANEL_ID} .t-meta, #${PANEL_ID} .t-imgs { font-size:11px; color:#94a3b8; margin-top:2px; }
      #${PANEL_ID} button {
        margin-top:10px; width:100%; padding:8px; border-radius:8px;
        background:#ff2442; color:#fff; border:none; font-size:13px;
        font-weight:600; cursor:pointer; transition:background .15s;
      }
      #${PANEL_ID} button:hover:not(:disabled) { background:#cc1a33; }
      #${PANEL_ID} button:disabled { background:#475569; cursor:default; }
      #${PANEL_ID} #tourit-xhs-progress {
        margin-top:8px; font-size:11px; color:#94a3b8;
        min-height:14px; line-height:1.5; white-space:pre-line;
      }
    `;
    document.documentElement.appendChild(style);
    document.documentElement.appendChild(panel);
    return panel;
  }

  function showStatus(msg, tone = 'info') {
    const p = ensurePanel(); p.dataset.tone = tone;
    p.innerHTML = `<strong>Tourit → 小红书</strong><div style="font-size:12px;color:#94a3b8;margin-top:4px">${esc(msg)}</div>`;
  }
})();
