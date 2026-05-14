// Runs on tourit.ca — captures listing data and injects a "发布到小红书" button.

(() => {
  if (window.__touritCaptureLoaded) return;
  window.__touritCaptureLoaded = true;

  const EMBED_ID   = 'tourit-listing-data';
  const BTN_ID     = 'tourit-capture-btn';
  const XHS_BTN_ID = 'tourit-xhs-btn';
  const XHS_URL    = 'https://creator.xiaohongshu.com/publish/publish?source=official&from=tab_switch&target=image';

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

  function syncAccountKey() {
    const d = readUserData();
    if (d?.is_agent && d?.account_key) {
      chrome.storage.local.set({ tourit_account_key: d.account_key });
    } else {
      chrome.storage.local.remove('tourit_account_key');
    }
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

  // ─── Capture ─────────────────────────────────────────────────────────────

  function capture(listing) {
    const enriched = { ...listing, site_origin: window.location.origin };
    chrome.storage.local.set({ tourit_listing: enriched }, () => {
      showToast(`✓ Captured: ${listing.address || listing.mls_number}`);
      updateBtn(true);
    });
  }

  // ─── MutationObserver ────────────────────────────────────────────────────
  // Watches <head> for listing data changes AND agent login/logout changes.

  const observer = new MutationObserver(() => {
    syncAccountKey();
    if (isAgentLoggedIn()) {
      const listing = extractListing();
      if (listing) capture(listing);
      else updateBtn(false);
      if (document.body) injectBtn();
    } else {
      removeButtons();
    }
  });
  observer.observe(document.head, { childList: true, subtree: true, characterData: true });

  if (isAgentLoggedIn()) {
    syncAccountKey();
    const existing = extractListing();
    if (existing) capture(existing);
  }

  // ─── Floating buttons ─────────────────────────────────────────────────────

  function removeButtons() {
    document.getElementById(BTN_ID)?.remove();
    document.getElementById(XHS_BTN_ID)?.remove();
  }

  function injectBtn() {
    // 小红书 publish button
    if (!document.getElementById(XHS_BTN_ID)) {
      const xhsBtn = document.createElement('button');
      xhsBtn.id = XHS_BTN_ID;
      xhsBtn.textContent = '发布到小红书';
      xhsBtn.style.cssText = [
        'position:fixed', 'bottom:90px', 'right:16px', 'z-index:2147483646',
        'padding:8px 14px', 'border-radius:20px',
        'background:#ff2442', 'color:#fff',
        'font:600 12px/1 system-ui,sans-serif',
        'border:none', 'cursor:pointer',
        'box-shadow:0 4px 16px rgba(255,36,66,0.4)',
        'transition:opacity 0.2s, background 0.15s', 'opacity:0.9',
      ].join(';');
      xhsBtn.addEventListener('mouseenter', () => { xhsBtn.style.opacity = '1'; xhsBtn.style.background = '#cc1a33'; });
      xhsBtn.addEventListener('mouseleave', () => { xhsBtn.style.opacity = '0.9'; xhsBtn.style.background = '#ff2442'; });
      xhsBtn.addEventListener('click', () => {
        const listing = extractListing();
        if (!listing) { showToast('⚠ No listing open — open a listing first'); return; }
        capture(listing);
        showToast('Opening 小红书…');
        setTimeout(() => chrome.runtime.sendMessage({ type: 'TOURIT_OPEN_XHS' }), 400);
      });
      document.body.appendChild(xhsBtn);
    }
  }

  function updateBtn() {}  // no-op — FBMP button hidden

  if (isAgentLoggedIn()) {
    if (document.body) injectBtn();
    else document.addEventListener('DOMContentLoaded', injectBtn);
  }

  // ─── Toast ────────────────────────────────────────────────────────────────

  function showToast(msg) {
    let toast = document.getElementById('tourit-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'tourit-toast';
      toast.style.cssText = [
        'position:fixed', 'bottom:134px', 'right:16px', 'z-index:2147483647',
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
})();
