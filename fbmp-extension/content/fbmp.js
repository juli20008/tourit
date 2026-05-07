// Runs on facebook.com/marketplace/create/rental
// Reads the listing captured from tourit.ca, fetches images via background worker,
// then reuses the same FBMP fill pipeline from the original Realm Rental Importer.

(() => {
  if (window.__touritFbmpLoaded) return;
  window.__touritFbmpLoaded = true;

  const PANEL_ID = 'tourit-fbmp-panel';

  // ─── Boot ─────────────────────────────────────────────────────────────────

  chrome.storage.local.get('tourit_listing', ({ tourit_listing: listing }) => {
    if (!listing) {
      showStatus('No Tourit listing captured yet.\nOpen a listing on tourit.ca first.', 'warn');
      return;
    }
    showReadyPanel(listing);
  });

  function showReadyPanel(listing) {
    const panel = ensurePanel();
    panel.dataset.tone = 'ready';
    panel.innerHTML = `
      <strong>Tourit → FBMP</strong>
      <div class="t-address">${escapeHtml(listing.address || listing.mls_number)}</div>
      <div class="t-meta">${listing.beds ?? '?'} bed · ${listing.baths ?? '?'} bath · $${Number(listing.price || 0).toLocaleString()}</div>
      <div class="t-imgs">${(listing.images || []).length} photo(s) ready</div>
      <button id="tourit-fill-btn">Fill Form</button>
      <div id="tourit-progress"></div>
    `;
    document.getElementById('tourit-fill-btn').addEventListener('click', () => {
      startFill(listing);
    });
  }

  async function startFill(listing) {
    const btn = document.getElementById('tourit-fill-btn');
    if (btn) btn.disabled = true;

    const imageUrls = listing.images || [];
    let imageFiles = [];

    if (imageUrls.length) {
      showStatus(`Fetching ${imageUrls.length} image(s)…`, 'info');
      imageFiles = await fetchImages(imageUrls);
      if (imageFiles.length === 0) {
        showStatus(`⚠ Could not fetch images (CDN blocked or no permission).\nFilling other fields…`, 'warn');
        await sleep(1200);
      } else if (imageFiles.length < imageUrls.length) {
        showStatus(`Fetched ${imageFiles.length}/${imageUrls.length} image(s). Filling form…`, 'info');
      } else {
        showStatus(`Got ${imageFiles.length} image(s). Filling form…`, 'info');
      }
    } else {
      showStatus('No images in listing. Filling text fields…', 'info');
    }

    const result = await autofillListing({ ...listing, images: imageFiles });
    renderSummary(result);
  }

  // ─── Image fetching (via background service worker) ───────────────────────

  function fetchImages(urls) {
    return new Promise((resolve) => {
      if (!urls.length) return resolve([]);
      chrome.runtime.sendMessage({ type: 'TOURIT_FETCH_IMAGES', urls }, (response) => {
        if (!response || !response.images) return resolve([]);
        const files = response.images
          .map((img) => {
            try {
              const uint8 = new Uint8Array(img.data);
              const blob = new Blob([uint8], { type: img.mime });
              return new File([blob], img.name, { type: img.mime });
            } catch {
              return null;
            }
          })
          .filter(Boolean);
        resolve(files);
      });
    });
  }

  // ─── FBMP autofill pipeline (adapted from Realm Rental Importer) ──────────

  async function autofillListing(listing) {
    const filled = [];
    const skipped = [];

    if (listing.images.length) {
      const uploaded = await tryUploadImages(listing.images);
      (uploaded ? filled : skipped).push(
        uploaded
          ? `Uploaded ${listing.images.length} image(s)`
          : 'Photo upload input not found'
      );
    } else {
      skipped.push('No images available');
    }

    await sleep(300);

    await fillRentCategoryField(filled, skipped);
    await fillTextField(['title', 'listing title'], listing.title, filled, skipped, 'Title');
    await fillTextField(['price', 'rent'], String(listing.price || ''), filled, skipped, 'Price', { numeric: true });
    await fillTextField(['description'], listing.description, filled, skipped, 'Description', { multiline: true });
    await fillAddressFields(listing, filled, skipped);
    await fillNumericField(['number of bedrooms', 'bedrooms', 'bedroom', 'beds'], String(listing.beds ?? ''), filled, skipped, 'Bedrooms');
    await fillNumericField(['number of bathrooms', 'bathrooms', 'bathroom', 'baths'], String(listing.baths ?? ''), filled, skipped, 'Bathrooms');
    await fillChoiceField(
      ['property type', 'home type', 'rental type', 'type'],
      mapPropertyType(listing.property_type, listing.style),
      filled,
      skipped,
      'Property type'
    );

    return { filled, skipped, listing };
  }

  async function tryUploadImages(files) {
    const input = await ensurePhotoUploadInput();
    if (!input) return false;

    const transfer = new DataTransfer();
    for (const file of files) transfer.items.add(file);

    // Set files — valid for file inputs (unlike text inputs, no prototype setter needed)
    input.files = transfer.files;
    await sleep(50);

    // Dispatch change event — React 17+ uses delegation so bubbles:true is required
    input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    // Also notify any parent form listeners
    input.closest('form, [role="form"]')?.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  async function ensurePhotoUploadInput() {
    let input = findBestFileInput();
    if (input) return input;

    const trigger = findPhotoUploadTrigger();
    if (trigger) {
      trigger.click();
      // Wait longer for FBMP's photo upload overlay to appear
      await sleep(800);
      input = findBestFileInput(trigger);
      if (input) return input;
      // One more attempt after extra delay
      await sleep(600);
      input = findBestFileInput();
      if (input) return input;
    }

    return waitFor(() => findBestFileInput(), 6000, 250);
  }

  async function fillTextField(keywords, rawValue, filled, skipped, label, options = {}) {
    const value = options.numeric ? normalizePrice(rawValue) : String(rawValue || '').trim();
    if (!value) { skipped.push(`${label} missing`); return; }

    const element = await waitFor(() => findBestTextField(keywords, options), 3000, 150);
    if (!element) { skipped.push(`${label} field not found`); return; }

    const success = setElementValue(element, value, options);
    (success ? filled : skipped).push(success ? `${label} filled` : `${label} could not be filled`);
  }

  async function fillNumericField(keywords, rawValue, filled, skipped, label) {
    const value = normalizeCount(rawValue);
    if (!value) { skipped.push(`${label} missing`); return; }

    const textInput = await waitFor(
      () => findBestTextField(keywords, { preferTextInput: true, exactKeywords: true }),
      2500, 120
    );

    if (textInput) {
      const success = setElementValue(textInput, value, { numeric: true });
      (success ? filled : skipped).push(success ? `${label} filled` : `${label} could not be filled`);
      return;
    }

    await fillChoiceField(keywords, value, filled, skipped, label);
  }

  async function fillRentCategoryField(filled, skipped) {
    const field = await waitFor(() => findRentCategoryField(), 2000, 120);
    if (!field) { skipped.push('Category field not found'); return; }

    if (field.tagName === 'INPUT') {
      if (setElementValue(field, 'Rent', {})) { filled.push('Category filled'); return; }
    }

    field.click();
    await sleep(250);

    const option = await waitFor(() => findChoiceOption('Rent'), 2500, 120);
    if (!option) { skipped.push('Category option "Rent" not found'); return; }

    option.click();
    filled.push('Category selected');
  }

  async function fillAddressFields(listing, filled, skipped) {
    const rawAddress = String(listing.address || '').trim();
    if (!rawAddress) { skipped.push('Address missing'); return; }

    const streetAddress = normalizeStreetAddress(rawAddress);
    const city = String(listing.city || '').trim();
    const addressInput = await waitFor(() => findAddressInput(), 3000, 150);

    if (!addressInput) { skipped.push('Address field not found'); return; }

    const query = city ? `${streetAddress}, ${city}` : streetAddress;
    setElementValue(addressInput, query, {});
    addressInput.focus();
    await sleep(900);

    const addressOption = await waitFor(() => findAddressSuggestion(streetAddress, city), 3500, 150);
    if (addressOption) {
      addressOption.click();
      await sleep(700);
      const accepted = addressLooksAccepted(addressInput, streetAddress, city);
      (accepted ? filled : skipped).push(accepted ? 'Address filled' : 'Address suggestion clicked but not accepted');
    } else {
      const accepted = await tryAcceptAddressByKeyboard(addressInput, streetAddress, city);
      (accepted ? filled : skipped).push(accepted ? 'Address filled' : 'Address suggestion not found');
    }

    if (city) {
      const cityInput = findCityInput();
      if (cityInput) setElementValue(cityInput, city, {});
    }
  }

  async function fillChoiceField(keywords, rawValue, filled, skipped, label) {
    const value = String(rawValue || '').trim();
    if (!value) { skipped.push(`${label} missing`); return; }

    const nativeSelect = findBestSelectField(keywords);
    if (nativeSelect && setSelectValue(nativeSelect, value)) { filled.push(`${label} selected`); return; }

    const combo = findBestCombobox(keywords);
    if (!combo) { skipped.push(`${label} field not found`); return; }

    combo.click();
    await sleep(250);

    const option = await waitFor(() => findChoiceOption(value), 2500, 120);
    if (!option) { skipped.push(`${label} option "${value}" not found`); return; }

    option.click();
    filled.push(`${label} selected`);
  }

  // ─── DOM finders (unchanged from original) ────────────────────────────────

  function findBestFileInput(preferredContext = null) {
    const inputs = Array.from(document.querySelectorAll('input[type="file"]')).filter((i) => !i.disabled);
    if (!inputs.length) return null;
    const prioritized = preferredContext ? prioritizeInputsNearContext(inputs, preferredContext) : inputs;
    const scored = inputs
      .map((input) => ({ input, score: scoreFileInput(input, prioritized.includes(input)) }))
      .sort((a, b) => b.score - a.score);
    return scored[0]?.score > 0 ? scored[0].input : inputs[0];
  }

  function prioritizeInputsNearContext(inputs, context) {
    const root = context.closest("label, section, form, [role='main'], [aria-labelledby], div") || context.parentElement || context;
    return inputs.filter((input) => {
      if (root.contains(input)) return true;
      const p = input.parentElement;
      return Boolean(p && (p.contains(context) || context.contains(p)));
    });
  }

  function scoreFileInput(input, isNearPhotoSection = false) {
    let score = 0;
    const accept = normalizeText(input.getAttribute('accept') || '');
    const descriptor = getElementDescriptor(input);
    if (accept.includes('image')) score += 20;
    if (input.multiple) score += 8;
    if (isNearPhotoSection) score += 16;
    if (descriptor.includes('photo')) score += 12;
    if (descriptor.includes('image')) score += 12;
    if (descriptor.includes('upload')) score += 10;
    if (descriptor.includes('media')) score += 6;
    if (isVisible(input)) score += 4;
    return score;
  }

  function findPhotoUploadTrigger() {
    const keywords = ['add photos', 'add photo', 'upload photos', 'upload photo', 'photos', 'photo', 'images', 'media'];
    const candidates = Array.from(document.querySelectorAll("button, [role='button'], label, div, span"))
      .filter((el) => isVisible(el))
      .filter((el) => { const t = normalizeText(el.innerText || el.textContent || ''); return t.length > 0 && t.length < 120; });
    return scoreCandidates(candidates, keywords, ['upload', 'photo', 'image', 'media']);
  }

  function findBestTextField(keywords, options = {}) {
    const candidates = Array.from(document.querySelectorAll("input, textarea, [contenteditable='true'], [role='textbox']"))
      .filter((el) => isVisible(el) && !el.disabled && !isFileInput(el))
      .filter((el) => {
        if (!options.preferTextInput) return true;
        return el.tagName === 'INPUT' || el.getAttribute('role') === 'textbox';
      });
    return scoreCandidates(candidates, keywords, options.multiline ? ['textarea', 'textbox', 'description'] : ['input', 'text'], options);
  }

  function findBestSelectField(keywords) {
    return scoreCandidates(
      Array.from(document.querySelectorAll('select')).filter((el) => isVisible(el) && !el.disabled),
      keywords
    );
  }

  function findBestCombobox(keywords) {
    return scoreCandidates(
      Array.from(document.querySelectorAll("[role='combobox'], button[aria-haspopup='listbox'], button[aria-expanded], div[aria-haspopup='listbox']"))
        .filter((el) => isVisible(el)),
      keywords
    );
  }

  function findAddressInput() {
    const candidates = Array.from(document.querySelectorAll("input, [role='combobox'], [role='textbox']"))
      .filter((el) => isVisible(el) && !el.disabled && !isFileInput(el));
    const directMatch = scoreCandidates(candidates, ['address', 'location', 'street address', 'property address'], ['address', 'location'], { preferCombobox: true });
    if (directMatch) return directMatch;
    const scored = candidates.map((el) => ({ el, score: scoreAddressLikeInput(el) })).sort((a, b) => b.score - a.score);
    return scored[0]?.score > 0 ? scored[0].el : null;
  }

  function findRentCategoryField() {
    const exactInput = Array.from(document.querySelectorAll('input'))
      .filter((el) => isVisible(el) && !el.disabled)
      .find((el) => { const d = getElementDescriptor(el); return d.includes('home for sale or rent') || d.includes('sale or rent'); });
    if (exactInput) return exactInput;

    const combos = Array.from(document.querySelectorAll("input[role='combobox'], [role='combobox']"))
      .filter((el) => isVisible(el) && !el.disabled && !isFileInput(el));
    const combo = scoreCandidates(combos, ['home for sale or rent', 'sale or rent'], ['rent'], { preferCombobox: true });
    if (combo) return combo;

    const wrapper = Array.from(document.querySelectorAll('label, div'))
      .filter((el) => isVisible(el))
      .find((el) => normalizeText(el.innerText || '').includes('home for sale or rent'));
    return wrapper?.querySelector("input[role='combobox'], input, [role='combobox']") || null;
  }

  function findCityInput() {
    return scoreCandidates(
      Array.from(document.querySelectorAll("input, [role='combobox'], [role='textbox']"))
        .filter((el) => isVisible(el) && !el.disabled && !isFileInput(el)),
      ['city'], ['city'], { preferTextInput: true, exactKeywords: true }
    );
  }

  function findAddressSuggestion(streetAddress, city) {
    const street = normalizeText(streetAddress);
    const normCity = normalizeText(city);
    const candidates = Array.from(document.querySelectorAll("[role='option'], [role='menuitem'], li, button, div[role='button'], div[tabindex]"))
      .filter((el) => isVisible(el));
    return (
      candidates.find((el) => { const t = normalizeText(el.textContent || ''); return t.includes(street) && (!normCity || t.includes(normCity)); }) ||
      candidates.find((el) => normalizeText(el.textContent || '').includes(street)) ||
      null
    );
  }

  async function tryAcceptAddressByKeyboard(input, streetAddress, city) {
    input.focus();
    dispatchKeyboardEvent(input, 'keydown', 'ArrowDown');
    dispatchKeyboardEvent(input, 'keyup', 'ArrowDown');
    await sleep(250);
    dispatchKeyboardEvent(input, 'keydown', 'Enter');
    dispatchKeyboardEvent(input, 'keyup', 'Enter');
    await sleep(800);
    return addressLooksAccepted(input, streetAddress, city);
  }

  function addressLooksAccepted(input, streetAddress, city) {
    const value = normalizeText(input.value || '');
    if (!value) return false;
    if (normalizeText(input.closest('label, div, section, form')?.innerText || '').includes('please choose one of the addresses suggested in the dropdown')) return false;
    if (!value.includes(normalizeText(streetAddress))) return false;
    if (city && !value.includes(normalizeText(city))) return false;
    return true;
  }

  function scoreAddressLikeInput(element) {
    let score = 0;
    const descriptor = getElementDescriptor(element);
    const containerText = normalizeText(element.closest('label, div, section, form')?.innerText || '');
    if (element.getAttribute('role') === 'combobox') score += 20;
    if (descriptor.includes('search')) score += 8;
    if (containerText.includes('city')) score += 16;
    if (containerText.includes('location')) score += 16;
    if (containerText.includes('address')) score += 16;
    if (containerText.includes('map')) score += 8;
    if (containerText.includes('place')) score += 8;
    if (!element.value) score += 4;
    const rect = element.getBoundingClientRect();
    if (rect.top > 300 && rect.top < 1200) score += 4;
    if (rect.height >= 40) score += 2;
    return score;
  }

  // ─── DOM helpers (unchanged from original) ────────────────────────────────

  function scoreCandidates(candidates, keywords, boosts = [], options = {}) {
    const normKeywords = keywords.map(normalizeText);
    let best = null, bestScore = 0;
    for (const candidate of candidates) {
      const descriptor = getElementDescriptor(candidate);
      if (!descriptor) continue;
      let score = 0;
      for (const kw of normKeywords) {
        if (descriptor.includes(kw)) score += kw.length + 5;
        if (options.exactKeywords && descriptor === kw) score += 20;
      }
      for (const b of boosts) if (descriptor.includes(normalizeText(b))) score += 2;
      if (options.preferCombobox && candidate.getAttribute('role') === 'combobox') score += 12;
      if (options.preferTextInput && candidate.tagName === 'INPUT') score += 8;
      if (score > bestScore) { best = candidate; bestScore = score; }
    }
    return best;
  }

  function getElementDescriptor(element) {
    const parts = [
      element.getAttribute('aria-label'),
      element.getAttribute('placeholder'),
      element.getAttribute('name'),
      element.getAttribute('id'),
      element.getAttribute('title'),
      element.getAttribute('data-testid'),
      element.labels ? Array.from(element.labels).map((l) => l.textContent).join(' ') : '',
      element.closest('label')?.textContent,
      closestLabelishText(element),
      element.textContent,
    ];
    return normalizeText(parts.filter(Boolean).join(' '));
  }

  function closestLabelishText(element) {
    let node = element.parentElement, depth = 0;
    while (node && depth < 4) {
      const text = normalizeText(node.innerText || node.textContent || '');
      if (text.length && text.length < 160) return text;
      node = node.parentElement; depth++;
    }
    return '';
  }

  function setElementValue(element, value, options = {}) {
    const tag = element.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') {
      const proto = tag === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      setter ? setter.call(element, value) : (element.value = value);
      dispatchInputEvents(element);
      return true;
    }
    if (element.isContentEditable || element.getAttribute('role') === 'textbox') {
      element.focus();
      element.textContent = options.multiline ? value : value.replace(/\s+/g, ' ');
      element.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    return false;
  }

  function setSelectValue(select, value) {
    const norm = normalizeText(value);
    const option = Array.from(select.options).find((o) => {
      const t = normalizeText(o.textContent || ''), v = normalizeText(o.value || '');
      return t === norm || v === norm || t.includes(norm);
    });
    if (!option) return false;
    select.value = option.value;
    dispatchInputEvents(select);
    return true;
  }

  function findChoiceOption(value) {
    const norm = normalizeText(value);
    const candidates = Array.from(document.querySelectorAll("[role='option'], li, button, div[role='button'], div[tabindex]"))
      .filter((el) => isVisible(el));
    return (
      candidates.find((el) => normalizeText(el.textContent || '') === norm) ||
      candidates.find((el) => normalizeText(el.textContent || '').includes(norm)) ||
      null
    );
  }

  function dispatchInputEvents(element) {
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function dispatchKeyboardEvent(element, type, key) {
    element.dispatchEvent(new KeyboardEvent(type, { key, code: key, bubbles: true, cancelable: true }));
  }

  function isVisible(element) {
    if (!(element instanceof HTMLElement)) return false;
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
  }

  function isFileInput(element) {
    return element.tagName === 'INPUT' && element.type === 'file';
  }

  // ─── Value normalizers ────────────────────────────────────────────────────

  function normalizeText(value) {
    return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function normalizePrice(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const match = raw.match(/[\d,.]+/);
    return match ? match[0].replace(/,/g, '') : raw;
  }

  function normalizeCount(value) {
    const match = String(value || '').match(/\d+(\.\d+)?/);
    return match ? match[0] : '';
  }

  function normalizeStreetAddress(address) {
    const raw = String(address || '').trim();
    return raw.replace(/\s+\d+[A-Za-z-]*$/, '').trim() || raw;
  }

  function mapPropertyType(propertyType, style) {
    const t = normalizeText(propertyType || '');
    const s = normalizeText(style || '');
    const combined = `${t} ${s}`;
    if (combined.includes('apartment') || t.includes('condo') || t.includes('co-op')) return 'Apartment';
    if (combined.includes('townhouse') || combined.includes('att/row') || combined.includes('row')) return 'Townhouse';
    if (t.includes('detached') || t.includes('semi') || t.includes('house')) return 'House';
    return 'House';
  }

  // ─── UI panel ─────────────────────────────────────────────────────────────

  function showStatus(message, tone = 'info') {
    const panel = ensurePanel();
    panel.dataset.tone = tone;
    panel.innerHTML = `<strong>Tourit → FBMP</strong><div>${escapeHtml(message)}</div>`;
  }

  function renderSummary(result) {
    const panel = ensurePanel();
    const filled = result.filled.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
    const skipped = result.skipped.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
    panel.dataset.tone = result.skipped.length ? 'warn' : 'success';
    panel.innerHTML = `
      <strong>Tourit → FBMP</strong>
      <div class="t-summary">
        <div><span>✓ Filled</span><ul>${filled || '<li>Nothing filled</li>'}</ul></div>
        ${skipped ? `<div><span>⚠ Skipped</span><ul>${skipped}</ul></div>` : ''}
      </div>
    `;
  }

  function ensurePanel() {
    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;

    panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.style.cssText = [
      'position:fixed', 'top:16px', 'right:16px', 'z-index:2147483647',
      'min-width:240px', 'max-width:320px', 'padding:14px 16px',
      'border-radius:14px', 'background:#0f172a', 'color:#f8fafc',
      'box-shadow:0 12px 40px rgba(0,0,0,0.4)',
      "font:13px/1.5 'Inter',system-ui,sans-serif",
    ].join(';');

    const style = document.createElement('style');
    style.textContent = `
      #${PANEL_ID}[data-tone="success"] { background:#14532d; }
      #${PANEL_ID}[data-tone="warn"]    { background:#78350f; }
      #${PANEL_ID}[data-tone="error"]   { background:#7f1d1d; }
      #${PANEL_ID}[data-tone="ready"]   { background:#1e293b; border:1px solid #334155; }
      #${PANEL_ID} strong { display:block; margin-bottom:6px; font-size:14px; letter-spacing:0.01em; }
      #${PANEL_ID} .t-address { font-weight:600; font-size:13px; }
      #${PANEL_ID} .t-meta, #${PANEL_ID} .t-imgs { font-size:11px; color:#94a3b8; margin-top:2px; }
      #${PANEL_ID} #tourit-fill-btn {
        margin-top:10px; width:100%; padding:8px; border-radius:8px;
        background:#2563eb; color:#fff; border:none; font-size:13px;
        font-weight:600; cursor:pointer; transition:background 0.15s;
      }
      #${PANEL_ID} #tourit-fill-btn:hover { background:#1d4ed8; }
      #${PANEL_ID} #tourit-fill-btn:disabled { background:#475569; cursor:default; }
      #${PANEL_ID} .t-summary { margin-top:6px; font-size:12px; }
      #${PANEL_ID} .t-summary span { display:block; font-weight:600; margin-top:6px; }
      #${PANEL_ID} ul { margin:2px 0 0; padding-left:16px; }
      #${PANEL_ID} li { margin:1px 0; }
    `;

    document.documentElement.appendChild(style);
    document.documentElement.appendChild(panel);
    return panel;
  }

  // ─── Utilities ────────────────────────────────────────────────────────────

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  async function waitFor(getFn, timeoutMs, intervalMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const val = getFn();
      if (val) return val;
      await sleep(intervalMs);
    }
    return null;
  }

  function escapeHtml(v) {
    return String(v || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
})();
