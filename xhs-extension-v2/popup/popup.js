const XHS_URL = 'https://creator.xiaohongshu.com/publish/publish?source=official&from=tab_switch&target=image';

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

  document.getElementById('listing-address').textContent =
    listing.address || listing.mls_number || '—';
  document.getElementById('listing-meta').textContent =
    `${listing.beds ?? '?'}床 · ${listing.baths ?? '?'}卫 · $${Number(listing.price || 0).toLocaleString()}`;
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

// ── Button: 发布到小红书 ───────────────────────────────────────────────────

document.getElementById('btn-open-xhs')?.addEventListener('click', () => {
  chrome.tabs.create({ url: XHS_URL });
  window.close();
});

// ── Button: 清除 ──────────────────────────────────────────────────────────

document.getElementById('btn-clear')?.addEventListener('click', () => {
  chrome.storage.local.remove('tourit_listing', () => render(null));
});

