// Runs on tourit.ca — captures listing data whenever a listing is open
// (modal OR standalone page), saves to chrome.storage.local, then automatically
// triggers a Google Drive save via the background service worker.

(() => {
  if (window.__touritCaptureLoaded) return;
  window.__touritCaptureLoaded = true;

  const EMBED_ID = 'tourit-listing-data';
  const BTN_ID   = 'tourit-capture-btn';

  // ─── Extract listing from embedded JSON ──────────────────────────────────

  function extractListing() {
    const el = document.getElementById(EMBED_ID);
    if (!el) return null;
    try {
      const data = JSON.parse(el.textContent);
      return (data && data.mls_number) ? data : null;
    } catch { return null; }
  }

  // ─── Capture + auto-save to Google Drive ─────────────────────────────────

  function capture(listing) {
    chrome.storage.local.set({ tourit_listing: listing }, () => {
      showToast(`Captured — saving to Drive…`);
      updateBtn(true);
      saveToGoogleDrive(listing);
    });
  }

  function saveToGoogleDrive(listing) {
    chrome.runtime.sendMessage({ type: 'TOURIT_SAVE_TO_GDRIVE', listing }, (response) => {
      if (chrome.runtime.lastError) {
        showToast(`Drive error: ${chrome.runtime.lastError.message}`);
        return;
      }
      if (response?.ok) {
        showToast(`Saved to Drive: ${response.folderName} (${response.photos} photo(s))`);
      } else {
        showToast(`Drive save failed: ${response?.error || 'unknown error'}`);
      }
    });
  }

  // ─── MutationObserver — watches document.head for embed appearing/changing

  const observer = new MutationObserver(() => {
    const listing = extractListing();
    if (listing) capture(listing);
    else updateBtn(false);
  });

  observer.observe(document.head, { childList: true, subtree: true, characterData: true });

  // Also try immediately in case embed is already present on page load
  const existing = extractListing();
  if (existing) capture(existing);

  // ─── Floating "Save to Drive" button ─────────────────────────────────────

  function injectBtn() {
    if (document.getElementById(BTN_ID)) return;

    const btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.textContent = 'Save to Drive';
    btn.style.cssText = [
      'position:fixed', 'bottom:48px', 'right:16px', 'z-index:2147483646',
      'padding:8px 14px', 'border-radius:20px',
      'background:#1a73e8', 'color:#fff',
      'font:600 12px/1 system-ui,sans-serif',
      'border:none', 'cursor:pointer',
      'box-shadow:0 4px 16px rgba(26,115,232,0.4)',
      'transition:opacity 0.2s, background 0.15s',
      'opacity:0.9',
    ].join(';');

    btn.addEventListener('mouseenter', () => { btn.style.opacity = '1'; btn.style.background = '#1557b0'; });
    btn.addEventListener('mouseleave', () => { btn.style.opacity = '0.9'; btn.style.background = '#1a73e8'; });

    btn.addEventListener('click', () => {
      const listing = extractListing();
      if (listing) {
        capture(listing);
      } else {
        showToast('No listing open — open a listing first');
      }
    });

    document.body.appendChild(btn);
  }

  function updateBtn(hasListing) {
    const btn = document.getElementById(BTN_ID);
    if (!btn) return;
    btn.textContent = hasListing ? 'Saved — Save Again' : 'Save to Drive';
    btn.style.background = hasListing ? '#16a34a' : '#1a73e8';
    if (hasListing) setTimeout(() => {
      if (document.getElementById(BTN_ID)) {
        btn.textContent = 'Save to Drive';
        btn.style.background = '#1a73e8';
      }
    }, 4000);
  }

  // Inject button once DOM is ready
  if (document.body) injectBtn();
  else document.addEventListener('DOMContentLoaded', injectBtn);

  // ─── Toast notification ───────────────────────────────────────────────────

  function showToast(msg) {
    let toast = document.getElementById('tourit-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'tourit-toast';
      toast.style.cssText = [
        'position:fixed', 'bottom:92px', 'right:16px', 'z-index:2147483647',
        'max-width:300px',
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
    toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 4000);
  }
})();
