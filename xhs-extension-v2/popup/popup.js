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

// ── Credits ───────────────────────────────────────────────────────────────────

let currentDeviceId = null;

function renderCredits(data) {
  const textEl = document.getElementById('credits-text');
  const buyEl  = document.getElementById('credits-buy');
  if (!textEl || !buyEl) return;

  const freeLeft = (data.free_total ?? 5) - (data.free_used ?? 0);
  const paid     = data.paid_credits ?? 0;

  if (freeLeft > 0) {
    textEl.textContent  = `AI额度：免费剩余 ${freeLeft} 次`;
    textEl.style.color  = '#16a34a';
    buyEl.style.display = 'none';
  } else if (paid > 0) {
    textEl.textContent  = `AI额度：付费剩余 ${paid} 次`;
    textEl.style.color  = '#2563eb';
    buyEl.style.display = 'none';
  } else {
    textEl.textContent  = '⚠ AI额度已用完';
    textEl.style.color  = '#dc2626';
    buyEl.style.display = 'block';
  }
}

function loadCredits() {
  chrome.storage.local.get('tourit_device_id', ({ tourit_device_id }) => {
    currentDeviceId = tourit_device_id || null;
    const textEl = document.getElementById('credits-text');

    if (!currentDeviceId) {
      if (textEl) { textEl.textContent = 'AI额度：初始化中…'; textEl.style.color = '#94a3b8'; }
      return;
    }

    fetch(`https://api.tourit.ca/api/xhs/credits?device_id=${encodeURIComponent(currentDeviceId)}`)
      .then(r => r.json())
      .then(data => renderCredits(data))
      .catch(() => {
        if (textEl) { textEl.textContent = 'AI额度：加载失败'; textEl.style.color = '#94a3b8'; }
      });
  });
}

loadCredits();

document.getElementById('btn-refresh-credits')?.addEventListener('click', () => {
  const textEl = document.getElementById('credits-text');
  if (textEl) { textEl.textContent = '刷新中…'; textEl.style.color = '#94a3b8'; }
  loadCredits();
});

document.getElementById('credits-qty')?.addEventListener('input', (e) => {
  const qty = Math.max(1, Math.min(50, parseInt(e.target.value) || 1));
  const btn = document.getElementById('btn-buy');
  if (btn) btn.textContent = `前往 PayPal 充值 $${qty}`;
});

document.getElementById('btn-buy')?.addEventListener('click', () => {
  if (!currentDeviceId) {
    setStatus('buy-status', '设备ID缺失，请重新安装插件。', true);
    return;
  }
  const qty = Math.max(1, Math.min(50, parseInt(document.getElementById('credits-qty')?.value) || 10));
  setStatus('buy-status', '正在创建订单…');

  fetch('https://api.tourit.ca/api/xhs/checkout/create', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ device_id: currentDeviceId, quantity: qty }),
  })
    .then(r => r.json())
    .then(data => {
      if (data.approve_url) {
        chrome.tabs.create({ url: data.approve_url });
        setStatus('buy-status', '已打开 PayPal，付款后点击 ↻ 刷新额度。');
      } else {
        setStatus('buy-status', '创建订单失败：' + (data.error || '未知错误'), true);
      }
    })
    .catch(e => setStatus('buy-status', '网络错误：' + e.message, true));
});

