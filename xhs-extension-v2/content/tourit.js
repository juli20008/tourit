// Runs on tourit.ca — captures listing data and injects a "发布到小红书" button.

(() => {
  if (window.__touritCaptureLoaded) return;
  window.__touritCaptureLoaded = true;

  const EMBED_ID   = 'tourit-listing-data';
  const XHS_BTN_ID = 'tourit-xhs-btn';

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

  // ─── Capture ─────────────────────────────────────────────────────────────

  function capture(listing) {
    if (!isChromeAlive()) return;
    const enriched = { ...listing, site_origin: window.location.origin };
    try {
      chrome.storage.local.set({ tourit_listing: enriched }, () => {
        if (chrome.runtime.lastError) return;
        showToast(`✓ Captured: ${listing.address || listing.mls_number}`);
      });
    } catch {}
  }

  // ─── Targeted head observer ───────────────────────────────────────────────
  // Watches document.head with childList:true only (NO subtree).
  // Fires only when #tourit-user-data or #tourit-listing-data are
  // inserted/removed — on login/logout and listing open/close — never on
  // ordinary React renders, which don't add/remove direct <head> children.

  function startHeadObserver() {
    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.id === 'tourit-user-data') {
            syncAccountKey();
          }
          if (node.id === EMBED_ID) {
            if (isAgentLoggedIn()) {
              const listing = extractListing();
              if (listing) capture(listing);
            }
          }
        }
        for (const node of m.removedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.id === 'tourit-user-data') {
            syncAccountKey(); // clears tourit_account_key from storage
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
    applyCreditsState();
    listenForCreditsChanges();
  }

  // ─── Credit state ─────────────────────────────────────────────────────────

  function applyCreditsState() {
    if (!isChromeAlive()) return;
    try {
      chrome.storage.local.get(['tourit_has_credits'], ({ tourit_has_credits }) => {
        setXhsBtnCredits(tourit_has_credits !== false);
      });
    } catch {}
  }

  function listenForCreditsChanges() {
    if (!isChromeAlive()) return;
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !('tourit_has_credits' in changes)) return;
        setXhsBtnCredits(changes.tourit_has_credits.newValue !== false);
      });
    } catch {}
  }

  function setXhsBtnCredits(hasCredits) {
    const btn = document.getElementById(XHS_BTN_ID);
    if (!btn) return;
    if (hasCredits) {
      btn.dataset.noCredits = '';
      btn.style.background  = '#ff2442';
      btn.style.opacity     = '0.9';
      btn.style.cursor      = 'pointer';
      btn.title             = '';
    } else {
      btn.dataset.noCredits = '1';
      btn.style.background  = '#94a3b8';
      btn.style.opacity     = '0.6';
      btn.style.cursor      = 'not-allowed';
      btn.title             = '请先充值 AI 额度';
    }
  }

  // ─── Floating button ──────────────────────────────────────────────────────

  function injectBtn() {
    if (document.getElementById(XHS_BTN_ID)) return;

    const btn = document.createElement('button');
    btn.id = XHS_BTN_ID;
    btn.textContent = '发布到小红书';
    btn.style.cssText = [
      'position:fixed', 'bottom:90px', 'right:16px', 'z-index:2147483646',
      'padding:8px 14px', 'border-radius:20px',
      'background:#ff2442', 'color:#fff',
      'font:600 12px/1 system-ui,sans-serif',
      'border:none', 'cursor:pointer',
      'box-shadow:0 4px 16px rgba(255,36,66,0.4)',
      'transition:opacity 0.2s, background 0.15s', 'opacity:0.9',
    ].join(';');
    btn.addEventListener('mouseenter', () => {
      if (btn.dataset.noCredits === '1') return;
      btn.style.opacity = '1'; btn.style.background = '#cc1a33';
    });
    btn.addEventListener('mouseleave', () => {
      if (btn.dataset.noCredits === '1') return;
      btn.style.opacity = '0.9'; btn.style.background = '#ff2442';
    });
    btn.addEventListener('click', () => {
      if (btn.dataset.noCredits === '1') {
        showToast('⚠ AI额度已用完，请打开插件充值');
        return;
      }
      if (!isAgentLoggedIn()) {
        showToast('请登录经纪人账号：www.tourit.ca/agent-login');
        return;
      }
      const listing = extractListing();
      if (!listing) { showToast('⚠ No listing open — open a listing first'); return; }
      capture(listing);
      showToast('Opening 小红书…');
      if (isChromeAlive()) setTimeout(() => {
        try { chrome.runtime.sendMessage({ type: 'TOURIT_OPEN_XHS' }, () => { void chrome.runtime.lastError; }); } catch {}
      }, 400);
    });
    document.body.appendChild(btn);
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

  if (document.body) init();
  else document.addEventListener('DOMContentLoaded', init);
})();
