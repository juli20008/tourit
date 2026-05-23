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
    `${listing.beds ?? '?'} bed · ${listing.baths ?? '?'} bath · $${Number(listing.price || 0).toLocaleString()}`;
  document.getElementById('listing-imgs').textContent =
    `${(listing.images || []).length} photo(s) ready`;
}

function setDriveStatus(msg, color = '#64748b') {
  const el = document.getElementById('drive-status');
  el.textContent = msg;
  el.style.color = color;
}

// Load current state
chrome.storage.local.get('tourit_listing', ({ tourit_listing }) => render(tourit_listing));

// "Capture" — grabs listing from the active tourit.ca tab
document.getElementById('btn-capture')?.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab || !tab.url?.includes('tourit.ca')) {
      document.getElementById('capture-status').textContent = 'Open a listing on tourit.ca first.';
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

// "Save to Google Drive"
document.getElementById('btn-save-drive')?.addEventListener('click', () => {
  chrome.storage.local.get('tourit_listing', ({ tourit_listing: listing }) => {
    if (!listing) { setDriveStatus('No listing captured.', '#dc2626'); return; }

    const btn = document.getElementById('btn-save-drive');
    btn.disabled = true;
    setDriveStatus('Saving to Drive…', '#1a73e8');

    chrome.runtime.sendMessage({ type: 'TOURIT_SAVE_TO_GDRIVE', listing }, (response) => {
      btn.disabled = false;
      if (chrome.runtime.lastError) {
        setDriveStatus(`Error: ${chrome.runtime.lastError.message}`, '#dc2626');
        return;
      }
      if (response?.ok) {
        setDriveStatus(`Saved: ${response.folderName} (${response.photos} photo(s))`, '#16a34a');
      } else {
        setDriveStatus(`Failed: ${response?.error || 'unknown error'}`, '#dc2626');
      }
    });
  });
});

// "Clear"
document.getElementById('btn-clear')?.addEventListener('click', () => {
  chrome.storage.local.remove('tourit_listing', () => {
    render(null);
    setDriveStatus('');
  });
});
