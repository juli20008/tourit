const FBMP_URL = 'https://www.facebook.com/marketplace/create/rental';

chrome.storage.local.get('tourit_listing', ({ tourit_listing: listing }) => {
  if (!listing) return;

  document.getElementById('no-listing').style.display = 'none';
  document.getElementById('listing-info').style.display = 'block';

  document.getElementById('listing-address').textContent = listing.address || listing.mls_number || '—';
  document.getElementById('listing-meta').textContent =
    `${listing.beds ?? '?'} bed · ${listing.baths ?? '?'} bath · $${Number(listing.price || 0).toLocaleString()}/mo`;
  document.getElementById('listing-imgs').textContent =
    `${(listing.images || []).length} photo(s) ready to upload`;
});

document.getElementById('btn-open-fbmp')?.addEventListener('click', () => {
  chrome.tabs.create({ url: FBMP_URL });
  window.close();
});

document.getElementById('btn-clear')?.addEventListener('click', () => {
  chrome.storage.local.remove('tourit_listing', () => {
    document.getElementById('listing-info').style.display = 'none';
    document.getElementById('no-listing').style.display = 'block';
  });
});
