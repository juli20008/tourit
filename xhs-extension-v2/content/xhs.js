// Runs on creator.xiaohongshu.com/publish/publish
//
// XHS two-step flow:
//
//   STEP 1 — large grey drop zone with red "上传图片" button
//     We intercept the hidden <input type="file"> so we can inject all photos
//     at once without opening the native file dialog.
//
//   STEP 2 — title + body editor appears after 下一步
//     Auto-fills title and body.
//
// Both sources (CDN listing and desktop folder upload) go through the background
// service worker so the XHS page's main thread is never blocked by heavy I/O.

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
      <div class="t-meta">${listing.source === 'desktop' ? '📁 桌面上传' : `${listing.beds ?? '?'}床 · ${listing.baths ?? '?'}卫 · $${fmt(listing.price)}`}</div>
      <div class="t-imgs">${count} 张图片（最多 ${MAX_PHOTOS} 张）</div>
      <label class="t-crop-label">
        <input type="checkbox" id="tourit-crop-cover" checked>
        封面图裁剪为 4:3 竖版
      </label>
      <button id="tourit-xhs-upload-btn">上传全部图片</button>
      <div id="tourit-xhs-progress"></div>
    `;
    id('tourit-xhs-upload-btn').addEventListener('click', () => runStep1(listing));
  }

  // ── Step 1: fetch → File[] → inject ──────────────────────────────────────
  //
  // Both CDN and desktop paths now follow the same structure:
  //   1. Ask background worker for images (network fetch or storage decode)
  //   2. Background returns {images:[{data,mime,name}], errors:[]}
  //   3. Create File objects here (cheap — data already in memory)
  //   4. Inject into XHS upload input

  async function runStep1(listing) {
    const btn = id('tourit-xhs-upload-btn');
    if (btn) btn.disabled = true;

    // ── 1. Get images from background worker ─────────────────────────────────
    let files, fetchErrors;

    if (listing.source === 'desktop') {
      setProgress('正在准备图片…');
      const resp = await fetchDesktopImages();
      files = resp.files;
      fetchErrors = resp.errors;
    } else {
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
      const resp = await fetchCdnImages(urls);
      files = resp.files;
      fetchErrors = resp.errors;
    }

    if (!files.length) {
      setProgress(`⚠ ${fetchErrors[0] || '图片获取失败'}`);
      if (btn) btn.disabled = false;
      return;
    }
    if (fetchErrors.length) {
      setProgress(`已获取 ${files.length} 张，继续…`);
      await sleep(600);
    }

    // ── 2. Crop cover image to 9:16 if checkbox is checked ────────────────────
    if (id('tourit-crop-cover')?.checked && files.length > 0) {
      setProgress('正在裁剪封面图为 4:3…');
      try {
        const cropped = await cropTo9x16(files[0]);
        files = [cropped, ...files.slice(1)];
      } catch (e) {
        console.warn('[xhs] cover crop failed, using original:', e.message);
      }
    }

    // ── 3. Inject into XHS ────────────────────────────────────────────────────
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

    const content = await buildContent(listing);

    setProgress('填写标题…');
    const titleOk = await fillTitleText(content.title);
    await sleep(400);

    setProgress('填写正文…');
    const bodyOk = await fillBodyText(content.body);
    await sleep(300);

    setProgress([
      titleOk ? '✓ 标题' : '⚠ 标题框未找到',
      bodyOk  ? '✓ 正文' : '⚠ 正文框未找到',
    ].join('  ') + '\n请检查后手动点击发布。');

    if (btn) btn.disabled = false;
  }

  // ── Content building ───────────────────────────────────────────────────────

  async function buildContent(listing) {
    if (listing.source === 'desktop') {
      return {
        title: (listing.title || '').slice(0, 20),
        body:  (listing.description || '').trim(),
      };
    }

    // Step 1: translate English description (used by both Claude and template)
    const rawDesc = (listing.description || '').trim().slice(0, 600);
    let translatedDesc = '';
    if (rawDesc) {
      setProgress('正在翻译房源内容…');
      translatedDesc = await translateToZh(rawDesc);
    }

    // Step 2: try Claude rewrite for rich multi-paragraph post
    setProgress('正在用 AI 生成文案…');
    const city_zh = displayCity(listing.city || '');
    const type_zh = translateType(listing.property_type, listing.style);
    const claudeBody = await claudeRewrite(listing, city_zh, type_zh, translatedDesc);

    if (claudeBody) {
      return { title: buildChineseTitle(listing), body: claudeBody };
    }

    // Step 3: fall back to built-in template
    return {
      title: buildChineseTitle(listing),
      body:  buildChineseBody(listing, translatedDesc),
    };
  }

  function claudeRewrite(listing, city_zh, type_zh, translated_desc) {
    return new Promise(resolve => {
      chrome.storage.local.get('tourit_device_id', ({ tourit_device_id }) => {
        chrome.runtime.sendMessage(
          { type: 'TOURIT_CLAUDE_REWRITE', listing, city_zh, type_zh, translated_desc, device_id: tourit_device_id || '' },
          resp => {
            if (chrome.runtime.lastError || !resp) return resolve(null);
            if (resp.error === 'no_credits') {
              setProgress('⚠ AI额度已用完，请在插件弹窗中充值 →');
              return resolve(null);  // fall back to built-in template
            }
            resolve(resp.text || null);
          }
        );
      });
    });
  }

  function buildChineseTitle(listing) {
    const city  = displayCity(listing.city || '');
    const type  = translateType(listing.property_type, listing.style);
    const beds  = listing.beds  ?? '';
    const baths = listing.baths ?? '';
    const price = fmt(listing.price);

    // Try progressively shorter options to stay ≤ 20 chars
    const opts = [
      `${city}${type}${beds}卧${baths}卫 $${price}`,
      `${city}${beds}卧${baths}卫${type} $${price}`,
      `${city}${beds}卧${baths}卫 $${price}`,
      `${city}${type}${beds}卧${baths}卫出售`,
      `${city}${beds}卧${baths}卫出售`,
    ];
    for (const o of opts) if (o.length <= 20) return o;
    return opts[opts.length - 1].slice(0, 20);
  }

  function buildChineseBody(listing, translatedDesc) {
    const city  = displayCity(listing.city || '');
    const type  = translateType(listing.property_type, listing.style);
    const price = fmt(listing.price);
    const beds  = listing.beds  ?? '?';
    const baths = listing.baths ?? '?';
    const mls   = listing.mls_number || '';

    const parts = [];

    // Location
    parts.push(`📍 ${listing.address || ''}${city ? '，' + city : ''}`);
    parts.push('');

    // Key specs
    parts.push(`💰 价格：$${price}`);
    parts.push(`🏠 ${type}　${beds}卧 ${baths}卫`);
    parts.push('');

    // Translated description
    if (translatedDesc) {
      parts.push('✨ 房源详情：');
      parts.push(translatedDesc);
      parts.push('');
    }

    // CTA
    if (mls) {
      parts.push(`🔑 预约看房：tourit.ca/listing/${mls}`);
      parts.push('');
    }

    // Hashtags
    const cityTag  = city  ? `#${city}买房 `  : '';
    const typeTag  = (type && type !== '住宅') ? `#多伦多${type} ` : '';
    parts.push(`#多伦多买房 ${cityTag}${typeTag}#加拿大房产 #海外置业 #多伦多房产 #加拿大生活`);

    return parts.join('\n').trim();
  }

  // ── Translation helper ─────────────────────────────────────────────────────

  function translateToZh(text) {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'TOURIT_TRANSLATE', text }, resp => {
        if (chrome.runtime.lastError || !resp) return resolve('');
        resolve(resp.text || '');
      });
    });
  }

  // ── Field lookup tables ────────────────────────────────────────────────────

  function displayCity(city) {
    const map = {
      'toronto':       '多伦多',
      'mississauga':   '密西沙加',
      'brampton':      '布兰普顿',
      'markham':       '万锦',
      'vaughan':       '旺市',
      'richmond hill': '列治文山',
      'oakville':      '奥克维尔',
      'burlington':    '伯灵顿',
      'hamilton':      '汉密尔顿',
      'scarborough':   '士嘉堡',
      'north york':    '北约克',
      'etobicoke':     '依多碧各',
      'east york':     '东约克',
      'ajax':          '阿积士',
      'pickering':     '皮克灵',
      'oshawa':        '奥沙华',
      'whitby':        '惠比',
      'newmarket':     '纽市',
      'aurora':        '奥罗拉',
    };
    return map[(city || '').toLowerCase()] || city || '';
  }

  function translateType(propertyType, style) {
    const t = (propertyType || '').toLowerCase();
    const s = (style        || '').toLowerCase();
    const c = `${t} ${s}`;
    if (c.includes('condo') || c.includes('apartment') || c.includes('co-op')) return '公寓';
    if (c.includes('townhouse') || c.includes('att/row') || c.includes('row')) return '联排别墅';
    if (t.includes('detached') && !t.includes('semi'))                          return '独立屋';
    if (t.includes('semi'))                                                     return '半独立屋';
    if (t.includes('house') || t.includes('bungalow'))                         return '独立屋';
    if (t.includes('duplex') || t.includes('triplex') || t.includes('plex'))   return '多单元住宅';
    if (t.includes('studio'))                                                   return '开间公寓';
    return '住宅';
  }

  // ── Image fetching ────────────────────────────────────────────────────────
  // Both helpers return { files: File[], errors: string[] }.
  // Heavy work (network fetch or base64 decode) happens in the background SW.

  function bgMessage(payload) {
    return new Promise(resolve => {
      chrome.runtime.sendMessage(payload, resp => {
        if (chrome.runtime.lastError) {
          const msg = chrome.runtime.lastError.message || '消息发送失败';
          console.error('[xhs] sendMessage error:', msg);
          return resolve({ images: [], errors: [`消息错误: ${msg}`] });
        }
        resolve(resp || { images: [], errors: ['background 无响应'] });
      });
    });
  }

  function respToFiles(resp) {
    const files = (resp.images || []).map(img => {
      try {
        return new File(
          [new Blob([new Uint8Array(img.data)], { type: img.mime })],
          img.name, { type: img.mime }
        );
      } catch { return null; }
    }).filter(Boolean);
    return { files, errors: resp.errors || [] };
  }

  async function fetchCdnImages(urls) {
    const resp = await bgMessage({ type: 'TOURIT_FETCH_IMAGES', urls });
    return respToFiles(resp);
  }

  async function fetchDesktopImages() {
    const resp = await bgMessage({ type: 'TOURIT_FETCH_DESKTOP_IMAGES' });
    return respToFiles(resp);
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

  async function fillTitleText(text) {
    const el = await waitFor(() => findFirst(SEL.title), 5000, 200);
    if (!el) return false;
    const rawMax = parseInt(el.getAttribute('maxlength') || '', 10);
    const max = rawMax > 0 ? rawMax : 20;
    setReactValue(el, text.slice(0, max));
    return true;
  }

  async function fillBodyText(text) {
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
    const ok = document.execCommand('insertText', false, text);
    if (!ok) {
      el.textContent = text;
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  // ── Cover crop (9:16 centre crop) ─────────────────────────────────────────

  function cropTo9x16(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objURL = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objURL);
        const sw = img.naturalWidth, sh = img.naturalHeight;
        const targetRatio = 3 / 4;            // width / height for portrait

        let cw, ch;
        if (sw / sh > targetRatio) {
          ch = sh; cw = Math.round(sh * targetRatio); // letterbox: crop sides
        } else {
          cw = sw; ch = Math.round(sw / targetRatio); // pillarbox: crop top/bottom
        }
        const cx = Math.round((sw - cw) / 2);
        const cy = Math.round((sh - ch) / 2);

        const canvas = document.createElement('canvas');
        canvas.width = cw; canvas.height = ch;
        canvas.getContext('2d').drawImage(img, cx, cy, cw, ch, 0, 0, cw, ch);

        canvas.toBlob(blob => {
          if (!blob) return reject(new Error('toBlob failed'));
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
        }, 'image/jpeg', 0.92);
      };
      img.onerror = () => { URL.revokeObjectURL(objURL); reject(new Error('image load failed')); };
      img.src = objURL;
    });
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
      #${PANEL_ID} .t-crop-label { display:flex; align-items:center; gap:6px; font-size:11px; color:#94a3b8; margin-top:7px; cursor:pointer; }
      #${PANEL_ID} .t-crop-label input { cursor:pointer; accent-color:#ff2442; }
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
