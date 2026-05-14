const FBMP_URL = 'https://www.facebook.com/marketplace/create/rental';

// ── Render listing ────────────────────────────────────────────────────────────

function render(listing) {
  document.getElementById('no-listing').style.display    = listing ? 'none'  : 'block';
  document.getElementById('listing-info').style.display  = listing ? 'block' : 'none';
  if (!listing) return;
  document.getElementById('listing-address').textContent = listing.address || listing.mls_number || '—';
  document.getElementById('listing-meta').textContent    =
    `${listing.beds ?? '?'} bed · ${listing.baths ?? '?'} bath · $${Number(listing.price || 0).toLocaleString()}`;
  document.getElementById('listing-imgs').textContent    =
    `${(listing.images || []).length} photo(s) ready to upload`;
}

chrome.storage.local.get('tourit_listing', ({ tourit_listing }) => render(tourit_listing));

// ── Status helpers ────────────────────────────────────────────────────────────

function setStatus(elId, msg, isError = false) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('error', isError);
}

// ── Capture button ────────────────────────────────────────────────────────────

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

// ── Open FBMP ─────────────────────────────────────────────────────────────────

document.getElementById('btn-open-fbmp')?.addEventListener('click', () => {
  chrome.tabs.create({ url: FBMP_URL });
  window.close();
});

// ── Clear ─────────────────────────────────────────────────────────────────────

document.getElementById('btn-clear')?.addEventListener('click', () => {
  chrome.storage.local.remove('tourit_listing', () => render(null));
});

// ── Credits ───────────────────────────────────────────────────────────────────

let currentAccountKey = null;

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
    textEl.textContent  = '⚠ No credits remaining';
    textEl.style.color  = '#dc2626';
    buyEl.style.display = 'block';
  }
}

function loadCredits() {
  chrome.storage.local.get('tourit_account_key', ({ tourit_account_key }) => {
    currentAccountKey = fbmpKey(tourit_account_key || null);
    const textEl = document.getElementById('credits-text');

    if (!currentAccountKey) {
      if (textEl) { textEl.textContent = 'Log in to tourit.ca as an agent first'; textEl.style.color = '#94a3b8'; }
      const buyEl = document.getElementById('credits-buy');
      if (buyEl) buyEl.style.display = 'none';
      return;
    }

    fetch(`https://api.tourit.ca/api/xhs/credits?device_id=${encodeURIComponent(currentAccountKey)}`)
      .then(r => r.json())
      .then(data => renderCredits(data))
      .catch(() => {
        if (textEl) { textEl.textContent = 'Credits: load failed'; textEl.style.color = '#94a3b8'; }
      });
  });
}

loadCredits();

document.getElementById('btn-refresh-credits')?.addEventListener('click', () => {
  const el = document.getElementById('credits-text');
  if (el) { el.textContent = 'Refreshing…'; el.style.color = '#94a3b8'; }
  loadCredits();
});

document.getElementById('credits-qty')?.addEventListener('input', (e) => {
  const qty = Math.max(1, Math.min(50, parseInt(e.target.value) || 1));
  const btn = document.getElementById('btn-buy');
  if (btn) btn.textContent = `Top up via PayPal $${qty}`;
});

document.getElementById('btn-buy')?.addEventListener('click', () => {
  if (!currentAccountKey) {
    setStatus('buy-status', 'Log in to tourit.ca as an agent first.', true);
    return;
  }
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
