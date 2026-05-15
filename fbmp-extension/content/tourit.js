// Runs on tourit.ca — captures listing data and injects "Save to FBMP" button.
// Only visible when an agent is logged in.

(() => {
  if (window.__touritFbmpCaptureLoaded) return;
  window.__touritFbmpCaptureLoaded = true;

  const EMBED_ID = 'tourit-listing-data';
  const BTN_ID   = 'tourit-capture-btn';

  // ─── Agent status ─────────────────────────────────────────────────────────

  function readUserData() {
    try {
      const el = document.getElementById('tourit-user-data');
      if (!el) return null;
      return JSON.parse(el.textContent);
    } catch { return null; }
  }

  function isAgentLoggedIn() {
    const d = readUserData();
    return !!(d?.is_agent && d?.account_key);
  }

  function isChromeAlive() {
    try { return !!chrome?.runtime?.id; } catch { return false; }
  }

  function syncAccountKey() {
    if (!isChromeAlive()) return;
    try {
      const d = readUserData();
      if (d?.is_agent && d?.account_key) {
        chrome.storage.local.set({ tourit_account_key: d.account_key });
      } else {
        chrome.storage.local.remove('tourit_account_key');
      }
    } catch {}
  }

  // ─── Extract listing from embedded JSON ──────────────────────────────────

  function extractListing() {
    const el = document.getElementById(EMBED_ID);
    if (!el) return null;
    try {
      const data = JSON.parse(el.textContent);
      return (data && data.mls_number) ? data : null;
    } catch { return null; }
  }

  // ─── Save to extension storage ───────────────────────────────────────────

  function capture(listing, onSuccess) {
    if (!isChromeAlive()) return;
    const enriched = { ...listing, site_origin: window.location.origin };
    try {
      chrome.storage.local.set({ tourit_listing: enriched }, () => {
        if (chrome.runtime.lastError) return;
        updateBtn(true);
        onSuccess?.();
      });
    } catch {}
  }

  // ─── Targeted head observer ───────────────────────────────────────────────
  // Watches document.head with childList:true only (NO subtree).
  // This fires only when #tourit-user-data or #tourit-listing-data are
  // inserted/removed — on login/logout and listing open/close — never on
  // ordinary React renders, which don't add/remove direct <head> children.

  function startHeadObserver() {
    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.id === 'tourit-user-data') {
            syncAccountKey();
            if (isAgentLoggedIn()) {
              const listing = extractListing();
              if (listing) { capture(listing); updateBtn(true); }
            }
          }
          if (node.id === EMBED_ID) {
            if (isAgentLoggedIn()) {
              const listing = extractListing();
              if (listing) { capture(listing); updateBtn(true); }
            } else {
              updateBtn(false);
            }
          }
        }
        for (const node of m.removedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.id === 'tourit-user-data') {
            syncAccountKey(); // clears tourit_account_key from storage
          }
          if (node.id === EMBED_ID) {
            updateBtn(false);
          }
        }
      }
    });
    obs.observe(document.head, { childList: true }); // no subtree
  }

  // ─── Init: run once on page load ─────────────────────────────────────────

  function init() {
    syncAccountKey();
    if (isAgentLoggedIn()) {
      const listing = extractListing();
      if (listing) capture(listing);
    }
    injectBtn();
    startHeadObserver();
  }

  // ─── Floating button ──────────────────────────────────────────────────────

  function injectBtn() {
    if (document.getElementById(BTN_ID)) return;

    const btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.textContent = 'Save to FBMP';
    btn.style.cssText = [
      'position:fixed', 'bottom:48px', 'right:16px', 'z-index:2147483646',
      'padding:8px 14px', 'border-radius:20px',
      'background:#2563eb', 'color:#fff',
      'font:600 12px/1 system-ui,sans-serif',
      'border:none', 'cursor:pointer',
      'box-shadow:0 4px 16px rgba(37,99,235,0.4)',
      'transition:opacity 0.2s, background 0.15s', 'opacity:0.9',
    ].join(';');
    btn.addEventListener('mouseenter', () => { btn.style.opacity = '1'; btn.style.background = '#1d4ed8'; });
    btn.addEventListener('mouseleave', () => { btn.style.opacity = '0.9'; btn.style.background = '#2563eb'; });
    btn.addEventListener('click', () => {
      if (!isAgentLoggedIn()) {
        showToast('请登录经纪人账号：www.tourit.ca/agent-login');
        return;
      }
      const listing = extractListing();
      if (!listing) { showToast('⚠ No listing open — open a listing first'); return; }
      showToast('✓ Saved — opening Facebook Marketplace…');
      capture(listing, () => {
        window.open('https://www.facebook.com/marketplace/create/rental', '_blank');
      });
    });
    document.body.appendChild(btn);
  }

  function updateBtn(hasListing) {
    const btn = document.getElementById(BTN_ID);
    if (!btn) return;
    btn.textContent = hasListing ? '✓ Saved — Save Again' : 'Save to FBMP';
    btn.style.background = hasListing ? '#16a34a' : '#2563eb';
    if (hasListing) setTimeout(() => {
      if (document.getElementById(BTN_ID)) {
        btn.textContent = 'Save to FBMP';
        btn.style.background = '#2563eb';
      }
    }, 3000);
  }

  // ─── Toast ────────────────────────────────────────────────────────────────

  function showToast(msg) {
    let toast = document.getElementById('tourit-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'tourit-toast';
      toast.style.cssText = [
        'position:fixed', 'bottom:92px', 'right:16px', 'z-index:2147483647',
        'padding:8px 14px', 'border-radius:10px',
        'background:#0f172a', 'color:#f8fafc',
        'font:13px/1.4 system-ui,sans-serif',
        'box-shadow:0 4px 20px rgba(0,0,0,0.3)',
        'pointer-events:none', 'transition:opacity 0.3s',
      ].join(';');
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 2500);
  }

  if (document.body) init();
  else document.addEventListener('DOMContentLoaded', init);
})();
