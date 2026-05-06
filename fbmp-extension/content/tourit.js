// Runs on tourit.ca — extracts listing data and saves to chrome.storage.local.
// tourit.ca embeds a <script id="tourit-listing-data" type="application/json">
// on standalone listing pages (/listing/:mls and /a/:agentId/listing/:mls).

(() => {
  function extractListing() {
    // Primary: read from embedded JSON (set by ListingPage.js via useEffect)
    const el = document.getElementById('tourit-listing-data');
    if (el) {
      try {
        const data = JSON.parse(el.textContent);
        if (data && data.mls_number) return data;
      } catch {}
    }
    return null;
  }

  function save(listing) {
    chrome.storage.local.set({ tourit_listing: listing }, () => {
      console.log('[Tourit FBMP] Listing captured:', listing.address);
    });
  }

  // Try immediately (page already rendered)
  const immediate = extractListing();
  if (immediate) {
    save(immediate);
    return;
  }

  // Otherwise wait for React to inject the element (up to 8 seconds)
  const start = Date.now();
  const interval = setInterval(() => {
    const listing = extractListing();
    if (listing) {
      clearInterval(interval);
      save(listing);
    } else if (Date.now() - start > 8000) {
      clearInterval(interval);
    }
  }, 300);
})();
