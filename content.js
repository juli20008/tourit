(() => {
  if (window.__realmRentalImporterLoaded) {
    return;
  }
  window.__realmRentalImporterLoaded = true;

  const PANEL_ID = "realm-rental-importer-status";
  const TITLE_FILE = "title.txt";
  const DESCRIPTION_FILE = "description.txt";
  const METADATA_FILE = "metadata.json";

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== "realm-open-folder-picker") {
      return false;
    }

    openFolderPicker()
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => {
        console.error("[Realm Rental Importer]", error);
        showStatus(`Import failed: ${error.message}`, "error");
        sendResponse({ ok: false, error: error.message });
      });

    return true;
  });

  async function openFolderPicker() {
    showStatus("Choose a listing folder to autofill this Marketplace form.", "info");

    const files = await chooseDirectoryFiles();
    if (!files.length) {
      showStatus("No folder was selected.", "warn");
      return { filled: [], skipped: ["No folder selected"], listing: { folderName: "No folder selected" } };
    }

    const listing = await buildListingFromFiles(files);
    const result = await autofillListing(listing);
    renderSummary(result);
    return result;
  }

  function chooseDirectoryFiles() {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.setAttribute("webkitdirectory", "");
      input.multiple = true;
      input.style.display = "none";
      document.documentElement.appendChild(input);

      const cleanup = () => input.remove();
      input.addEventListener(
        "change",
        () => {
          const fileList = Array.from(input.files || []);
          cleanup();
          resolve(fileList);
        },
        { once: true },
      );

      input.click();
    });
  }

  async function buildListingFromFiles(files) {
    const entries = new Map();
    for (const file of files) {
      const relativePath = normalizeRelativePath(file.webkitRelativePath || file.name);
      entries.set(relativePath.toLowerCase(), file);
    }

    const metadataFile = findFile(entries, METADATA_FILE);
    const titleFile = findFile(entries, TITLE_FILE);
    const descriptionFile = findFile(entries, DESCRIPTION_FILE);
    const imageFiles = files
      .filter((file) => /\/images\/.+\.(jpg|jpeg|png|webp|gif)$/i.test(normalizeRelativePath(file.webkitRelativePath || file.name)))
      .sort((a, b) =>
        normalizeRelativePath(a.webkitRelativePath || a.name).localeCompare(
          normalizeRelativePath(b.webkitRelativePath || b.name),
          undefined,
          { numeric: true },
        ),
      );

    const metadata = metadataFile ? safeParseJson(await metadataFile.text()) : {};
    const titleText = titleFile ? stripBom(await titleFile.text()).trim() : "";
    const rawDescriptionText = descriptionFile ? stripBom(await descriptionFile.text()).trim() : "";
    const descriptionText = extractEnglishDescription(rawDescriptionText);
    const folderName = normalizeRelativePath(files[0].webkitRelativePath || files[0].name).split("/")[0] || "listing";

    return {
      folderName,
      metadata,
      title: titleText || stringValue(metadata.title),
      description: descriptionText || stringValue(metadata.description),
      price: stringValue(metadata.price),
      address: stringValue(metadata.address),
      city: inferListingCity(metadata, rawDescriptionText || stringValue(metadata.description)),
      propertyType: stringValue(metadata.propertyType),
      propertySubtype: stringValue(metadata.propertySubtype),
      beds: normalizeCount(metadata.beds),
      baths: normalizeCount(metadata.baths),
      images: imageFiles,
    };
  }

  async function autofillListing(listing) {
    const filled = [];
    const skipped = [];

    if (listing.images.length) {
      const uploaded = await tryUploadImages(listing.images);
      (uploaded ? filled : skipped).push(uploaded ? `Uploaded ${listing.images.length} image${listing.images.length === 1 ? "" : "s"}` : "Photo upload input not found");
    } else {
      skipped.push("No local images found in the selected folder");
    }

    await sleep(300);

    await fillRentCategoryField(filled, skipped);
    await fillTextField(["title", "listing title"], listing.title, filled, skipped, "Title");
    await fillTextField(["price", "rent"], listing.price, filled, skipped, "Price", { numeric: true });
    await fillTextField(["description"], listing.description, filled, skipped, "Description", { multiline: true });
    await fillAddressFields(listing, filled, skipped);

    await fillNumericField(["number of bedrooms", "bedrooms", "bedroom", "beds"], listing.beds, filled, skipped, "Bedrooms");
    await fillNumericField(["number of bathrooms", "bathrooms", "bathroom", "baths"], listing.baths, filled, skipped, "Bathrooms");
    await fillChoiceField(
      ["property type", "home type", "rental type", "type"],
      mapMarketplacePropertyType(listing.propertyType, listing.propertySubtype),
      filled,
      skipped,
      "Property type",
    );

    return { filled, skipped, listing };
  }

  async function tryUploadImages(files) {
    const input = await ensurePhotoUploadInput();
    if (!input) {
      return false;
    }

    const transfer = new DataTransfer();
    for (const file of files) {
      transfer.items.add(file);
    }

    input.files = transfer.files;
    dispatchInputEvents(input);
    input.closest("form")?.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  async function ensurePhotoUploadInput() {
    let input = findBestFileInput();
    if (input) {
      return input;
    }

    const trigger = findPhotoUploadTrigger();
    if (trigger) {
      trigger.click();
      await sleep(400);
      input = findBestFileInput(trigger);
      if (input) {
        return input;
      }
    }

    return waitFor(() => findBestFileInput(), 5000, 200);
  }

  async function fillTextField(keywords, rawValue, filled, skipped, label, options = {}) {
    const value = options.numeric ? normalizePrice(rawValue) : String(rawValue || "").trim();
    if (!value) {
      skipped.push(`${label} missing from listing folder`);
      return;
    }

    const element = await waitFor(() => findBestTextField(keywords, options), 3000, 150);
    if (!element) {
      skipped.push(`${label} field not found`);
      return;
    }

    const success = setElementValue(element, value, options);
    (success ? filled : skipped).push(success ? `${label} filled` : `${label} could not be filled`);
  }

  async function fillNumericField(keywords, rawValue, filled, skipped, label) {
    const value = normalizeCount(rawValue);
    if (!value) {
      skipped.push(`${label} missing from listing folder`);
      return;
    }

    const textInput = await waitFor(
      () =>
        findBestTextField(keywords, {
          preferTextInput: true,
          exactKeywords: true,
        }),
      2500,
      120,
    );

    if (textInput) {
      const success = setElementValue(textInput, value, { numeric: true });
      (success ? filled : skipped).push(success ? `${label} filled` : `${label} could not be filled`);
      return;
    }

    await fillChoiceField(keywords, value, filled, skipped, label);
  }

  async function fillRentCategoryField(filled, skipped) {
    const keywords = ["home for sale or rent", "sale or rent", "rental type", "listing type", "category"];
    const field = await waitFor(() => findRentCategoryField(), 2000, 120);
    if (!field) {
      skipped.push("Category field not found");
      return;
    }

    if (field.tagName === "INPUT") {
      const success = setElementValue(field, "Rent", {});
      if (success) {
        filled.push("Category filled");
        return;
      }
    }

    field.click();
    await sleep(250);

    const option = await waitFor(() => findChoiceOption("Rent"), 2500, 120);
    if (!option) {
      skipped.push('Category option "Rent" not found');
      return;
    }

    option.click();
    filled.push("Category selected");
  }

  async function fillAddressFields(listing, filled, skipped) {
    const rawAddress = String(listing.address || "").trim();
    if (!rawAddress) {
      skipped.push("Address missing from listing folder");
      return;
    }

    const streetAddress = normalizeStreetAddress(rawAddress);
    const city = String(listing.city || "").trim();
    const addressInput = await waitFor(() => findAddressInput(), 3000, 150);

    if (!addressInput) {
      skipped.push("Address field not found");
      return;
    }

    const query = city ? `${streetAddress}, ${city}` : streetAddress;
    setElementValue(addressInput, query, {});
    addressInput.focus();
    await sleep(900);

    const addressOption = await waitFor(() => findAddressSuggestion(streetAddress, city), 3500, 150);
    if (addressOption) {
      addressOption.click();
      await sleep(700);
      const accepted = addressLooksAccepted(addressInput, streetAddress, city);
      (accepted ? filled : skipped).push(accepted ? "Address filled" : "Address suggestion clicked but not accepted");
    } else {
      const accepted = await tryAcceptAddressByKeyboard(addressInput, streetAddress, city);
      (accepted ? filled : skipped).push(accepted ? "Address filled" : "Address suggestion not found");
    }

    if (city) {
      const cityInput = findCityInput();
      if (cityInput) {
        setElementValue(cityInput, city, {});
      }
    }
  }

  async function fillChoiceField(keywords, rawValue, filled, skipped, label) {
    const value = String(rawValue || "").trim();
    if (!value) {
      skipped.push(`${label} missing from listing folder`);
      return;
    }

    const nativeSelect = findBestSelectField(keywords);
    if (nativeSelect && setSelectValue(nativeSelect, value)) {
      filled.push(`${label} selected`);
      return;
    }

    const combo = findBestCombobox(keywords);
    if (!combo) {
      skipped.push(`${label} field not found`);
      return;
    }

    combo.click();
    await sleep(250);

    const option = await waitFor(() => findChoiceOption(value), 2500, 120);
    if (!option) {
      skipped.push(`${label} option "${value}" not found`);
      return;
    }

    option.click();
    filled.push(`${label} selected`);
  }

  function findBestFileInput(preferredContext = null) {
    const inputs = Array.from(document.querySelectorAll('input[type="file"]'));
    const photoInputs = inputs.filter((input) => !input.disabled);
    if (!photoInputs.length) {
      return null;
    }

    const prioritized = preferredContext ? prioritizeInputsNearContext(photoInputs, preferredContext) : photoInputs;
    const scored = photoInputs
      .map((input) => ({ input, score: scoreFileInput(input, prioritized.includes(input)) }))
      .sort((left, right) => right.score - left.score);

    return scored[0]?.score > 0 ? scored[0].input : photoInputs[0];
  }

  function prioritizeInputsNearContext(inputs, context) {
    const contextRoot =
      context.closest("label, section, form, [role='main'], [aria-labelledby], div") || context.parentElement || context;

    return inputs.filter((input) => {
      if (contextRoot.contains(input)) return true;
      const inputParent = input.parentElement;
      return Boolean(inputParent && (inputParent.contains(context) || context.contains(inputParent)));
    });
  }

  function scoreFileInput(input, isNearPhotoSection = false) {
    let score = 0;
    const accept = normalizeText(input.getAttribute("accept") || "");
    const descriptor = getElementDescriptor(input);

    if (accept.includes("image")) score += 20;
    if (input.multiple) score += 8;
    if (isNearPhotoSection) score += 16;
    if (descriptor.includes("photo")) score += 12;
    if (descriptor.includes("image")) score += 12;
    if (descriptor.includes("upload")) score += 10;
    if (descriptor.includes("media")) score += 6;
    if (isVisible(input)) score += 4;

    return score;
  }

  function findPhotoUploadTrigger() {
    const keywords = ["add photos", "add photo", "upload photos", "upload photo", "photos", "photo", "images", "media"];
    const candidates = Array.from(
      document.querySelectorAll("button, [role='button'], label, div, span"),
    )
      .filter((element) => isVisible(element))
      .filter((element) => {
        const text = normalizeText(element.innerText || element.textContent || "");
        return text.length > 0 && text.length < 120;
      });

    return scoreCandidates(candidates, keywords, ["upload", "photo", "image", "media"]);
  }

  function findBestTextField(keywords, options = {}) {
    const candidates = Array.from(document.querySelectorAll("input, textarea, [contenteditable='true'], [role='textbox']"))
      .filter((element) => isVisible(element) && !element.disabled && !isFileInput(element))
      .filter((element) => {
        if (!options.preferTextInput) return true;
        return element.tagName === "INPUT" || element.getAttribute("role") === "textbox";
      });

    return scoreCandidates(
      candidates,
      keywords,
      options.multiline ? ["textarea", "textbox", "description"] : ["input", "text"],
      options,
    );
  }

  function findBestSelectField(keywords) {
    const candidates = Array.from(document.querySelectorAll("select")).filter((element) => isVisible(element) && !element.disabled);
    return scoreCandidates(candidates, keywords);
  }

  function findBestCombobox(keywords) {
    const candidates = Array.from(
      document.querySelectorAll("[role='combobox'], button[aria-haspopup='listbox'], button[aria-expanded], div[aria-haspopup='listbox']"),
    ).filter((element) => isVisible(element));

    return scoreCandidates(candidates, keywords);
  }

  function findAddressInput() {
    const candidates = Array.from(document.querySelectorAll("input, [role='combobox'], [role='textbox']"))
      .filter((element) => isVisible(element) && !element.disabled && !isFileInput(element));

    const directMatch = scoreCandidates(candidates, ["address", "location", "street address", "property address"], ["address", "location"], {
      preferCombobox: true,
    });
    if (directMatch) {
      return directMatch;
    }

    const locationCandidates = candidates
      .map((element) => ({ element, score: scoreAddressLikeInput(element) }))
      .sort((left, right) => right.score - left.score);

    return locationCandidates[0]?.score > 0 ? locationCandidates[0].element : null;
  }

  function findRentCategoryField() {
    const exactInput = Array.from(document.querySelectorAll("input"))
      .filter((element) => isVisible(element) && !element.disabled)
      .find((element) => {
        const descriptor = getElementDescriptor(element);
        return descriptor.includes("home for sale or rent") || descriptor.includes("sale or rent");
      });

    if (exactInput) {
      return exactInput;
    }

    const comboboxes = Array.from(document.querySelectorAll("input[role='combobox'], [role='combobox']"))
      .filter((element) => isVisible(element) && !element.disabled && !isFileInput(element));

    const exactCombo = scoreCandidates(comboboxes, ["home for sale or rent", "sale or rent"], ["rent"], {
      preferCombobox: true,
      exactKeywords: false,
    });

    if (exactCombo) {
      return exactCombo;
    }

    const wrappers = Array.from(document.querySelectorAll("label, div"))
      .filter((element) => isVisible(element))
      .find((element) => {
        const text = normalizeText(element.innerText || "");
        return text.includes("home for sale or rent");
      });

    if (!wrappers) {
      return null;
    }

    return (
      wrappers.querySelector("input[role='combobox'], input, [role='combobox']") ||
      null
    );
  }

  function findCityInput() {
    const candidates = Array.from(document.querySelectorAll("input, [role='combobox'], [role='textbox']"))
      .filter((element) => isVisible(element) && !element.disabled && !isFileInput(element));

    return scoreCandidates(candidates, ["city"], ["city"], {
      preferTextInput: true,
      exactKeywords: true,
    });
  }

  function findAddressSuggestion(streetAddress, city) {
    const street = normalizeText(streetAddress);
    const normalizedCity = normalizeText(city);
    const candidates = Array.from(document.querySelectorAll("[role='option'], [role='menuitem'], li, button, div[role='button'], div[tabindex]"))
      .filter((element) => isVisible(element));

    return (
      candidates.find((element) => {
        const text = normalizeText(element.textContent || "");
        return text.includes(street) && (!normalizedCity || text.includes(normalizedCity));
      }) ||
      candidates.find((element) => normalizeText(element.textContent || "").includes(street)) ||
      null
    );
  }

  async function tryAcceptAddressByKeyboard(input, streetAddress, city) {
    input.focus();
    dispatchKeyboardEvent(input, "keydown", "ArrowDown");
    dispatchKeyboardEvent(input, "keyup", "ArrowDown");
    await sleep(250);
    dispatchKeyboardEvent(input, "keydown", "Enter");
    dispatchKeyboardEvent(input, "keyup", "Enter");
    await sleep(800);
    return addressLooksAccepted(input, streetAddress, city);
  }

  function addressLooksAccepted(input, streetAddress, city) {
    const value = normalizeText(input.value || "");
    const street = normalizeText(streetAddress);
    const normalizedCity = normalizeText(city);
    const nearbyText = normalizeText(input.closest("label, div, section, form")?.innerText || "");

    if (!value) return false;
    if (nearbyText.includes("please choose one of the addresses suggested in the dropdown")) return false;
    if (!value.includes(street)) return false;
    if (normalizedCity && !value.includes(normalizedCity)) return false;
    return true;
  }

  function dispatchKeyboardEvent(element, type, key) {
    element.dispatchEvent(
      new KeyboardEvent(type, {
        key,
        code: key,
        bubbles: true,
        cancelable: true,
      }),
    );
  }

  function scoreAddressLikeInput(element) {
    let score = 0;
    const descriptor = getElementDescriptor(element);
    const containerText = normalizeText(element.closest("label, div, section, form")?.innerText || "");
    const value = normalizeText(element.value || element.textContent || "");

    if (element.getAttribute("role") === "combobox") score += 20;
    if (descriptor.includes("search")) score += 8;
    if (containerText.includes("city")) score += 16;
    if (containerText.includes("location")) score += 16;
    if (containerText.includes("address")) score += 16;
    if (containerText.includes("map")) score += 8;
    if (containerText.includes("place")) score += 8;
    if (containerText.includes("markham") || containerText.includes("toronto")) score += 10;
    if (value === "") score += 4;

    const rect = element.getBoundingClientRect();
    if (rect.top > 300 && rect.top < 1200) score += 4;
    if (rect.height >= 40) score += 2;

    return score;
  }

  function scoreCandidates(candidates, keywords, boosts = [], options = {}) {
    const normalizedKeywords = keywords.map(normalizeText);
    let best = null;
    let bestScore = 0;

    for (const candidate of candidates) {
      const descriptor = getElementDescriptor(candidate);
      if (!descriptor) continue;

      let score = 0;
      for (const keyword of normalizedKeywords) {
        if (descriptor.includes(keyword)) {
          score += keyword.length + 5;
        }
        if (options.exactKeywords && descriptor === keyword) {
          score += 20;
        }
      }

      for (const boost of boosts) {
        if (descriptor.includes(normalizeText(boost))) {
          score += 2;
        }
      }

      if (options.preferCombobox && candidate.getAttribute("role") === "combobox") {
        score += 12;
      }
      if (options.preferTextInput && candidate.tagName === "INPUT") {
        score += 8;
      }

      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }

    return best;
  }

  function getElementDescriptor(element) {
    const parts = [
      element.getAttribute("aria-label"),
      element.getAttribute("placeholder"),
      element.getAttribute("name"),
      element.getAttribute("id"),
      element.getAttribute("title"),
      element.getAttribute("data-testid"),
      element.labels ? Array.from(element.labels).map((label) => label.textContent).join(" ") : "",
      element.closest("label")?.textContent,
      closestLabelishText(element),
      element.textContent,
    ];

    return normalizeText(parts.filter(Boolean).join(" "));
  }

  function closestLabelishText(element) {
    let node = element.parentElement;
    let depth = 0;
    while (node && depth < 4) {
      const text = normalizeText(node.innerText || node.textContent || "");
      if (text.length && text.length < 160) {
        return text;
      }
      node = node.parentElement;
      depth += 1;
    }
    return "";
  }

  function setElementValue(element, value, options = {}) {
    const tag = element.tagName;

    if (tag === "INPUT" || tag === "TEXTAREA") {
      const prototype = tag === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
      if (setter) {
        setter.call(element, value);
      } else {
        element.value = value;
      }
      dispatchInputEvents(element);
      return true;
    }

    if (element.isContentEditable || element.getAttribute("role") === "textbox") {
      element.focus();
      element.textContent = options.multiline ? value : value.replace(/\s+/g, " ");
      element.dispatchEvent(new InputEvent("input", { bubbles: true, data: value, inputType: "insertText" }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }

    return false;
  }

  function setSelectValue(select, value) {
    const normalizedValue = normalizeText(value);
    const option = Array.from(select.options).find((candidate) => {
      const text = normalizeText(candidate.textContent || "");
      const optionValue = normalizeText(candidate.value || "");
      return text === normalizedValue || optionValue === normalizedValue || text.includes(normalizedValue);
    });

    if (!option) {
      return false;
    }

    select.value = option.value;
    dispatchInputEvents(select);
    return true;
  }

  function findChoiceOption(value) {
    const normalizedValue = normalizeText(value);
    const candidates = Array.from(document.querySelectorAll("[role='option'], li, button, div[role='button'], div[tabindex]"))
      .filter((element) => isVisible(element));

    return (
      candidates.find((element) => normalizeText(element.textContent || "") === normalizedValue) ||
      candidates.find((element) => normalizeText(element.textContent || "").includes(normalizedValue)) ||
      null
    );
  }

  function dispatchInputEvents(element) {
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  function isVisible(element) {
    if (!(element instanceof HTMLElement)) return false;
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
  }

  function isFileInput(element) {
    return element.tagName === "INPUT" && element.type === "file";
  }

  function normalizeRelativePath(value) {
    return String(value || "").replace(/\\/g, "/").replace(/^\/+/, "");
  }

  function extractEnglishDescription(text) {
    const value = String(text || "").trim();
    if (!value) return "";

    const englishMarkerMatch = value.match(/(?:^|\n)\s*English:\s*/i);
    if (!englishMarkerMatch || englishMarkerMatch.index == null) {
      return value;
    }

    const englishText = value.slice(englishMarkerMatch.index + englishMarkerMatch[0].length).trim();
    return englishText || value;
  }

  function normalizeText(value) {
    return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
  }

  function normalizePrice(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const match = raw.match(/[\d,.]+/);
    return match ? match[0].replace(/,/g, "") : raw;
  }

  function normalizeCount(value) {
    const raw = String(value || "").trim();
    const match = raw.match(/\d+(\.\d+)?/);
    return match ? match[0] : raw;
  }

  function mapMarketplacePropertyType(propertyType, propertySubtype) {
    const normalizedType = normalizeText(propertyType);
    const normalizedSubtype = normalizeText(propertySubtype);
    const combined = `${normalizedType} ${normalizedSubtype}`.trim();

    if (
      combined.includes("apartment") ||
      normalizedType.includes("condo") ||
      normalizedType.includes("co-op") ||
      normalizedSubtype.includes("apartment") ||
      normalizedSubtype.includes("multi-level")
    ) {
      return "Apartment";
    }

    if (
      normalizedType.includes("townhouse") ||
      normalizedType.includes("att/row") ||
      normalizedType.includes("row") ||
      normalizedSubtype.includes("townhouse")
    ) {
      return "Townhouse";
    }

    if (
      normalizedType.includes("detached") ||
      normalizedType.includes("semi-detached") ||
      normalizedType.includes("house") ||
      normalizedSubtype.includes("detached") ||
      normalizedSubtype.includes("house")
    ) {
      return "House";
    }

    return firstNonEmpty(propertySubtype, propertyType);
  }

  function normalizeStreetAddress(address) {
    const raw = String(address || "").trim();
    return raw.replace(/\s+\d+[A-Za-z-]*$/, "").trim() || raw;
  }

  function inferListingCity(metadata, description) {
    const directCity = stringValue(metadata.city).trim();
    if (directCity) {
      return directCity;
    }

    const text = String(description || "");
    const englishArea = text.match(/Area:\s*([^\n·]+)/i);
    if (englishArea?.[1]) {
      return englishArea[1].trim();
    }

    const chineseArea = text.match(/位置[:：]\s*([^\n]+)/);
    if (chineseArea?.[1]) {
      return chineseArea[1].trim();
    }

    return "";
  }

  function stringValue(value) {
    return value == null ? "" : String(value);
  }

  function firstNonEmpty(...values) {
    return values.find((value) => String(value || "").trim()) || "";
  }

  function findFile(entries, fileName) {
    const lowerName = fileName.toLowerCase();
    for (const [relativePath, file] of entries.entries()) {
      if (relativePath.endsWith(`/${lowerName}`) || relativePath === lowerName) {
        return file;
      }
    }
    return null;
  }

  function safeParseJson(text) {
    try {
      return JSON.parse(stripBom(text));
    } catch (error) {
      console.warn("[Realm Rental Importer] Failed to parse metadata.json", error);
      return {};
    }
  }

  function stripBom(text) {
    return String(text || "").replace(/^\uFEFF/, "");
  }

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  async function waitFor(getValue, timeoutMs, intervalMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const value = getValue();
      if (value) {
        return value;
      }
      await sleep(intervalMs);
    }
    return null;
  }

  function showStatus(message, tone = "info") {
    const panel = ensurePanel();
    panel.dataset.tone = tone;
    panel.innerHTML = `<strong>Realm Importer</strong><div>${escapeHtml(message)}</div>`;
  }

  function renderSummary(result) {
    const panel = ensurePanel();
    const filled = result.filled.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
    const skipped = result.skipped.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
    panel.dataset.tone = result.skipped.length ? "warn" : "success";
    panel.innerHTML = `
      <strong>Realm Importer</strong>
      <div>${escapeHtml(result.listing.folderName)}</div>
      <div class="realm-summary">
        <div><span>Filled</span><ul>${filled || "<li>Nothing filled</li>"}</ul></div>
        <div><span>Skipped</span><ul>${skipped || "<li>Nothing skipped</li>"}</ul></div>
      </div>
    `;
  }

  function ensurePanel() {
    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;

    panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.style.cssText = [
      "position:fixed",
      "top:16px",
      "right:16px",
      "z-index:2147483647",
      "max-width:360px",
      "padding:12px 14px",
      "border-radius:12px",
      "background:#111827",
      "color:#f9fafb",
      "box-shadow:0 12px 40px rgba(0,0,0,0.35)",
      "font:13px/1.45 system-ui,sans-serif",
    ].join(";");

    const style = document.createElement("style");
    style.textContent = `
      #${PANEL_ID}[data-tone="success"] { background: #14532d; }
      #${PANEL_ID}[data-tone="warn"] { background: #78350f; }
      #${PANEL_ID}[data-tone="error"] { background: #7f1d1d; }
      #${PANEL_ID} strong { display: block; margin-bottom: 4px; font-size: 14px; }
      #${PANEL_ID} .realm-summary { display: grid; gap: 8px; margin-top: 8px; }
      #${PANEL_ID} .realm-summary span { display: block; font-weight: 600; margin-bottom: 2px; }
      #${PANEL_ID} ul { margin: 0; padding-left: 18px; }
      #${PANEL_ID} li { margin: 0; }
    `;

    document.documentElement.appendChild(style);
    document.documentElement.appendChild(panel);
    return panel;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
})();
