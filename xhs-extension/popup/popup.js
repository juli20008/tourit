const XHS_URL = 'https://creator.xiaohongshu.com/publish/publish?source=official&from=tab_switch&target=image';
const MAX_IMG  = 18;
const IMG_EXT  = /\.(jpe?g|png|gif|webp|heic|avif|bmp)$/i;

// ── Render ─────────────────────────────────────────────────────────────────

function render(listing) {
  const noEl   = document.getElementById('no-listing');
  const infoEl = document.getElementById('listing-info');
  if (!listing) {
    noEl.style.display   = 'block';
    infoEl.style.display = 'none';
    return;
  }
  noEl.style.display   = 'none';
  infoEl.style.display = 'block';

  const isDesktop = listing.source === 'desktop';
  document.getElementById('listing-address').textContent =
    listing.title || listing.address || listing.mls_number || '—';
  document.getElementById('listing-meta').textContent = isDesktop
    ? '📁 桌面上传'
    : `${listing.beds ?? '?'}床 · ${listing.baths ?? '?'}卫 · $${Number(listing.price || 0).toLocaleString()}/月`;
  document.getElementById('listing-imgs').textContent =
    `${(listing.images || []).length} 张图片待上传`;
}

// Load saved listing on open
chrome.storage.local.get('tourit_listing', ({ tourit_listing }) => render(tourit_listing));

// ── Status helpers ─────────────────────────────────────────────────────────

function setStatus(elId, msg, isError = false) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('error', isError);
}

// ── Button: 抓取当前房源 ────────────────────────────────────────────────────

document.getElementById('btn-capture')?.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab || !tab.url?.includes('tourit.ca')) {
      setStatus('capture-status', '请先在 tourit.ca 打开一个房源。', true);
      return;
    }
    chrome.scripting.executeScript(
      {
        target: { tabId: tab.id },
        func: () => {
          const el = document.getElementById('tourit-listing-data');
          if (!el) return null;
          try { return JSON.parse(el.textContent); } catch { return null; }
        },
      },
      (results) => {
        const listing = results?.[0]?.result;
        if (listing && listing.mls_number) {
          chrome.storage.local.set({ tourit_listing: listing }, () => {
            setStatus('capture-status', '✓ 已抓取！');
            render(listing);
            setTimeout(() => setStatus('capture-status', ''), 2000);
          });
        } else {
          setStatus('capture-status', '该页面未找到房源数据。', true);
        }
      }
    );
  });
});

// ── Button: 从桌面上传 ────────────────────────────────────────────────────

document.getElementById('btn-desktop')?.addEventListener('click', () => {
  document.getElementById('folder-input').click();
});

document.getElementById('folder-input')?.addEventListener('change', async (e) => {
  const allFiles = Array.from(e.target.files || []);
  e.target.value = ''; // reset so same folder can be re-selected

  if (!allFiles.length) return;

  setStatus('desktop-status', '正在读取文件夹…');

  // ── Find .txt file (directly inside root, depth = 2: root/file.txt) ──────
  const txtFile = allFiles.find(f => {
    const parts = f.webkitRelativePath.split('/');
    return parts.length === 2 && f.name.toLowerCase().endsWith('.txt');
  });

  // ── Find image files ──────────────────────────────────────────────────────
  // Prefer files inside an "images" subfolder (depth 3: root/images/file.jpg)
  let imgFiles = allFiles.filter(f => {
    const parts = f.webkitRelativePath.split('/');
    return parts.length === 3 && parts[1].toLowerCase() === 'images' && IMG_EXT.test(f.name);
  });
  // Fallback: images directly in root (depth 2)
  if (!imgFiles.length) {
    imgFiles = allFiles.filter(f => {
      const parts = f.webkitRelativePath.split('/');
      return parts.length === 2 && IMG_EXT.test(f.name);
    });
  }
  imgFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  imgFiles = imgFiles.slice(0, MAX_IMG);

  if (!txtFile && !imgFiles.length) {
    setStatus('desktop-status', '⚠ 未找到 .txt 或图片，请检查文件夹结构。', true);
    return;
  }

  // ── Parse txt ─────────────────────────────────────────────────────────────
  let title = '', description = '';
  if (txtFile) {
    try {
      const text = await txtFile.text();
      const lines = text.trim().split(/\r?\n/);
      title = lines[0].trim();
      description = lines.slice(1).join('\n').trim();
    } catch (err) {
      setStatus('desktop-status', `⚠ 读取文本失败: ${err.message}`, true);
      return;
    }
  }
  if (!title && imgFiles.length) {
    title = imgFiles[0].name.replace(/\.[^.]+$/, '');
  }

  // ── Compress & convert images to base64 ──────────────────────────────────
  setStatus('desktop-status', `正在处理 ${imgFiles.length} 张图片…`);
  const dataURLs = [];
  for (let i = 0; i < imgFiles.length; i++) {
    setStatus('desktop-status', `处理图片 ${i + 1}/${imgFiles.length}…`);
    try {
      const dataURL = await compressImage(imgFiles[i]);
      if (dataURL) dataURLs.push(dataURL);
    } catch {
      // skip broken images silently
    }
  }

  if (!dataURLs.length && !title) {
    setStatus('desktop-status', '⚠ 无法读取任何图片。', true);
    return;
  }

  const listing = {
    source:      'desktop',
    title,
    description,
    address:     title,   // used by render() and xhs.js display
    images:      dataURLs,
  };

  chrome.storage.local.set({ tourit_listing: listing }, () => {
    setStatus('desktop-status', `✓ 已加载 ${dataURLs.length} 张图片`);
    render(listing);
    setTimeout(() => setStatus('desktop-status', ''), 3000);
  });
});

// ── Image compression (canvas, max 1200px wide, JPEG 0.85) ────────────────

function compressImage(file, maxWidth = 1200, quality = 0.85) {
  return new Promise((resolve) => {
    const img = new Image();
    const objURL = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objURL);
      const scale  = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(objURL); resolve(null); };
    img.src = objURL;
  });
}

// ── Button: 发布到小红书 ───────────────────────────────────────────────────

document.getElementById('btn-open-xhs')?.addEventListener('click', () => {
  chrome.tabs.create({ url: XHS_URL });
  window.close();
});

// ── Button: 清除 ──────────────────────────────────────────────────────────

document.getElementById('btn-clear')?.addEventListener('click', () => {
  chrome.storage.local.remove('tourit_listing', () => render(null));
});
