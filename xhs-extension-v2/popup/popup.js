const XHS_URL = 'https://creator.xiaohongshu.com/publish/publish?source=official&from=tab_switch&target=image';

// ── Login gate ────────────────────────────────────────────────────────────────

let currentAccountKey = null;

function showLoginGate() {
  document.getElementById('login-gate').style.display    = 'block';
  document.getElementById('main-section').style.display  = 'none';
}

function showMainSection() {
  document.getElementById('login-gate').style.display    = 'none';
  document.getElementById('main-section').style.display  = 'block';
}

// ── Render listing ────────────────────────────────────────────────────────────

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

// ── Status helpers ────────────────────────────────────────────────────────────

function setStatus(elId, msg, isError = false) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('error', isError);
}

// ── Credits ───────────────────────────────────────────────────────────────────

function renderCredits(data) {
  const textEl  = document.getElementById('credits-text');
  const buyEl   = document.getElementById('credits-buy');
  const openBtn = document.getElementById('btn-open-xhs');
  if (!textEl || !buyEl) return;

  const freeLeft = (data.free_total ?? 5) - (data.free_used ?? 0);
  const paid     = data.paid_credits ?? 0;
  const hasCredits = freeLeft > 0 || paid > 0;

  // Persist credit state so tourit.js can grey the floating button without an API call
  chrome.storage.local.set({ tourit_has_credits: hasCredits });

  if (freeLeft > 0) {
    textEl.textContent  = `AI额度：免费剩余 ${freeLeft} 次`;
    textEl.style.color  = '#16a34a';
    buyEl.style.display = 'none';
  } else if (paid > 0) {
    textEl.textContent  = `AI额度：付费剩余 ${paid} 次`;
    textEl.style.color  = '#2563eb';
    buyEl.style.display = 'none';
  } else {
    textEl.textContent  = '⚠ AI额度已用完，请充值继续使用';
    textEl.style.color  = '#dc2626';
    buyEl.style.display = 'block';
  }

  // Grey out "发布到小红书" when no credits; capture is always free
  if (openBtn) {
    openBtn.disabled        = !hasCredits;
    openBtn.style.opacity   = hasCredits ? '' : '0.4';
    openBtn.style.cursor    = hasCredits ? '' : 'not-allowed';
    openBtn.title           = hasCredits ? '' : '请先充值 AI 额度';
  }
}

function loadCredits() {
  chrome.storage.local.get(['tourit_account_key', 'tourit_listing'], ({ tourit_account_key, tourit_listing }) => {
    currentAccountKey = tourit_account_key || null;

    if (!currentAccountKey) {
      showLoginGate();
      return;
    }

    showMainSection();
    render(tourit_listing || null);

    const textEl = document.getElementById('credits-text');
    if (textEl) { textEl.textContent = 'AI额度加载中…'; textEl.style.color = '#94a3b8'; }

    fetch(`https://api.tourit.ca/api/xhs/credits?device_id=${encodeURIComponent(currentAccountKey)}`)
      .then(r => r.json())
      .then(data => renderCredits(data))
      .catch(() => {
        if (textEl) { textEl.textContent = 'AI额度：加载失败'; textEl.style.color = '#94a3b8'; }
      });
  });
}

loadCredits();

// ── Button: 抓取当前房源 ──────────────────────────────────────────────────────

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

// ── Button: 发布到小红书 ──────────────────────────────────────────────────────

document.getElementById('btn-open-xhs')?.addEventListener('click', () => {
  chrome.tabs.create({ url: XHS_URL });
  window.close();
});

// ── Button: 清除 ──────────────────────────────────────────────────────────────

document.getElementById('btn-clear')?.addEventListener('click', () => {
  chrome.storage.local.remove('tourit_listing', () => render(null));
});

// ── Refresh credits ───────────────────────────────────────────────────────────

document.getElementById('btn-refresh-credits')?.addEventListener('click', () => {
  const textEl = document.getElementById('credits-text');
  if (textEl) { textEl.textContent = '刷新中…'; textEl.style.color = '#94a3b8'; }
  loadCredits();
});

// ── Buy / top-up ──────────────────────────────────────────────────────────────

document.getElementById('credits-qty')?.addEventListener('input', (e) => {
  const qty = Math.max(1, Math.min(50, parseInt(e.target.value) || 1));
  const btn = document.getElementById('btn-buy');
  if (btn) btn.textContent = `前往 PayPal 充值 $${qty}`;
});

document.getElementById('btn-buy')?.addEventListener('click', () => {
  if (!currentAccountKey) return;
  const qty = Math.max(1, Math.min(50, parseInt(document.getElementById('credits-qty')?.value) || 10));
  setStatus('buy-status', '正在创建订单…');

  fetch('https://api.tourit.ca/api/xhs/checkout/create', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ device_id: currentAccountKey, quantity: qty }),
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
