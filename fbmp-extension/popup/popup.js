const FBMP_URL = 'https://www.facebook.com/marketplace/create/rental';

// ── Login gate ────────────────────────────────────────────────────────────────

let currentAccountKey = null;

function showLoginGate() {
  document.getElementById('login-gate').style.display   = 'block';
  document.getElementById('main-section').style.display = 'none';
}

function showMainSection() {
  document.getElementById('login-gate').style.display   = 'none';
  document.getElementById('main-section').style.display = 'block';
}

// ── Render listing ────────────────────────────────────────────────────────────

function render(listing) {
  document.getElementById('no-listing').style.display   = listing ? 'none'  : 'block';
  document.getElementById('listing-info').style.display = listing ? 'block' : 'none';
  if (!listing) return;
  document.getElementById('listing-address').textContent = listing.address || listing.mls_number || '—';
  document.getElementById('listing-meta').textContent    =
    `${listing.beds ?? '?'} bed · ${listing.baths ?? '?'} bath · $${Number(listing.price || 0).toLocaleString()}`;
  document.getElementById('listing-imgs').textContent    =
    `${(listing.images || []).length} photo(s) ready to upload`;
}

// ── Status helpers ────────────────────────────────────────────────────────────

function setStatus(elId, msg, isError = false) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('error', isError);
}

// ── Credits ───────────────────────────────────────────────────────────────────

function fbmpKey(key) { return key ? `fbmp_${key}` : null; }

function renderCredits(data) {
  const textEl = document.getElementById('credits-text');
  const buyEl  = document.getElementById('credits-buy');
  if (!textEl || !buyEl) return;

  const freeLeft = (data.free_total ?? 5) - (data.free_used ?? 0);
  const paid     = data.paid_credits ?? 0;

  if (freeLeft > 0) {
    textEl.textContent  = `Credits: ${freeLeft} free remaining`;
    textEl.style.color  = '#16a34a';
    buyEl.style.display = 'none';
  } else if (paid > 0) {
    textEl.textContent  = `Credits: ${paid} paid remaining`;
    textEl.style.color  = '#2563eb';
    buyEl.style.display = 'none';
  } else {
    textEl.textContent  = '⚠ No credits remaining — please top up';
    textEl.style.color  = '#dc2626';
    buyEl.style.display = 'block';
  }
}

function loadCredits() {
  chrome.storage.local.get(['tourit_account_key', 'tourit_listing'], ({ tourit_account_key, tourit_listing }) => {
    const fbmpAccountKey = fbmpKey(tourit_account_key || null);
    currentAccountKey = fbmpAccountKey;

    if (!fbmpAccountKey) {
      showLoginGate();
      return;
    }

    showMainSection();
    render(tourit_listing || null);

    const textEl = document.getElementById('credits-text');
    if (textEl) { textEl.textContent = 'Credits loading…'; textEl.style.color = '#94a3b8'; }

    fetch(`https://api.tourit.ca/api/xhs/credits?device_id=${encodeURIComponent(fbmpAccountKey)}`)
      .then(r => r.json())
      .then(data => renderCredits(data))
      .catch(() => {
        if (textEl) { textEl.textContent = 'Credits: load failed'; textEl.style.color = '#94a3b8'; }
      });
  });
}

loadCredits();

// ── Button: Capture ───────────────────────────────────────────────────────────

document.getElementById('btn-capture')?.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab || !tab.url?.includes('tourit.ca')) {
      setStatus('capture-status', 'Open a listing on tourit.ca first.', true);
      return;
    }
    chrome.scripting.executeScript(
      { target: { tabId: tab.id }, func: () => {
          const el = document.getElementById('tourit-listing-data');
          if (!el) return null;
          try { return JSON.parse(el.textContent); } catch { return null; }
        }
      },
      (results) => {
        const listing = results?.[0]?.result;
        if (listing && listing.mls_number) {
          chrome.storage.local.set({ tourit_listing: listing }, () => {
            setStatus('capture-status', '✓ Captured!');
            render(listing);
            setTimeout(() => setStatus('capture-status', ''), 2000);
          });
        } else {
          setStatus('capture-status', 'No listing found on this page.', true);
        }
      }
    );
  });
});

// ── Button: Open FBMP ─────────────────────────────────────────────────────────

document.getElementById('btn-open-fbmp')?.addEventListener('click', () => {
  chrome.tabs.create({ url: FBMP_URL });
  window.close();
});

// ── Button: Clear ─────────────────────────────────────────────────────────────

document.getElementById('btn-clear')?.addEventListener('click', () => {
  chrome.storage.local.remove('tourit_listing', () => render(null));
});

// ── Refresh credits ───────────────────────────────────────────────────────────

document.getElementById('btn-refresh-credits')?.addEventListener('click', () => {
  const textEl = document.getElementById('credits-text');
  if (textEl) { textEl.textContent = 'Refreshing…'; textEl.style.color = '#94a3b8'; }
  loadCredits();
});

// ── Buy / top-up ──────────────────────────────────────────────────────────────

document.getElementById('credits-qty')?.addEventListener('input', (e) => {
  const qty = Math.max(1, Math.min(50, parseInt(e.target.value) || 1));
  const btn = document.getElementById('btn-buy');
  if (btn) btn.textContent = `Top up via PayPal $${qty}`;
});

document.getElementById('btn-buy')?.addEventListener('click', () => {
  if (!currentAccountKey) return;
  const qty = Math.max(1, Math.min(50, parseInt(document.getElementById('credits-qty')?.value) || 10));
  setStatus('buy-status', 'Creating order…');

  fetch('https://api.tourit.ca/api/fbmp/checkout/create', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ device_id: currentAccountKey, quantity: qty }),
  })
    .then(r => r.json())
    .then(data => {
      if (data.approve_url) {
        chrome.tabs.create({ url: data.approve_url });
        setStatus('buy-status', 'PayPal opened — click ↻ after payment.');
      } else {
        setStatus('buy-status', 'Order failed: ' + (data.error || 'unknown'), true);
      }
    })
    .catch(e => setStatus('buy-status', 'Network error: ' + e.message, true));
});
