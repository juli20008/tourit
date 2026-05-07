const FBMP_URL = 'https://www.facebook.com/marketplace/create/rental';

function render(listing) {
  if (!listing) {
    document.getElementById('no-listing').style.display = 'block';
    document.getElementById('listing-info').style.display = 'none';
    return;
  }
  document.getElementById('no-listing').style.display = 'none';
  document.getElementById('listing-info').style.display = 'block';
  document.getElementById('listing-address').textContent = listing.address || listing.mls_number || '—';
  document.getElementById('listing-meta').textContent =
    `${listing.beds ?? '?'} bed · ${listing.baths ?? '?'} bath · $${Number(listing.price || 0).toLocaleString()}/mo`;
  document.getElementById('listing-imgs').textContent =
    `${(listing.images || []).length} photo(s) ready to upload`;
}

// Load current state
chrome.storage.local.get('tourit_listing', ({ tourit_listing }) => render(tourit_listing));

// "Capture" — tells the active tourit.ca tab to grab the current listing
document.getElementById('btn-capture')?.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab || !tab.url?.includes('tourit.ca')) {
      document.getElementById('capture-status').textContent = 'Open a listing on tourit.ca first.';
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
            document.getElementById('capture-status').textContent = '✓ Captured!';
            render(listing);
            setTimeout(() => { document.getElementById('capture-status').textContent = ''; }, 2000);
          });
        } else {
          document.getElementById('capture-status').textContent = 'No listing open on this page.';
        }
      }
    );
  });
});

// "Open FBMP"
document.getElementById('btn-open-fbmp')?.addEventListener('click', () => {
  chrome.tabs.create({ url: FBMP_URL });
  window.close();
});

// "Clear"
document.getElementById('btn-clear')?.addEventListener('click', () => {
  chrome.storage.local.remove('tourit_listing', () => render(null));
});
