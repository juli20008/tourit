import React, { useState, useEffect, useCallback } from 'react';

// ── Helpers ────────────────────────────────────────────────────────────────────

function currentLang() {
  const s = localStorage.getItem('tourit_lang');
  return s === 'zh' ? 'zh' : 'en';
}

function setCookie(val) {
  const h = window.location.hostname;
  document.cookie = `googtrans=${val}; path=/`;
  document.cookie = `googtrans=${val}; path=/; domain=${h}`;
  document.cookie = `googtrans=${val}; path=/; domain=.${h}`;
}

function clearCookies() { setCookie(''); setCookie('/en/en'); }

// Load Google's script exactly once, then wait for the combo to appear
function loadGoogleTranslate(onReady) {
  if (window.__gtLoaded) {
    waitForCombo(onReady);
    return;
  }
  window.__gtLoaded = true;
  window.googleTranslateElementInit = function () {
    new window.google.translate.TranslateElement(
      { pageLanguage: 'en', includedLanguages: 'zh-CN', autoDisplay: false },
      'google_translate_element'
    );
    waitForCombo(onReady);
  };
  const s = document.createElement('script');
  s.src = '//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
  document.body.appendChild(s);
}

function waitForCombo(cb, retries = 50) {
  const el = document.querySelector('.goog-te-combo');
  if (el) { cb(el); return; }
  if (retries > 0) setTimeout(() => waitForCombo(cb, retries - 1), 100);
}

// ── Google Translate correction patches ────────────────────────────────────────
// Google makes specific errors on real-estate and Canadian terminology.
// Order matters: longer/more-specific patterns before shorter ones.
const ZH_FIXES = [
  ['积极的', '在售'],           // "Active" (adjective) → for sale
  ['积极',   '在售'],           // "Active" → for sale
  ['地位',   '状态'],           // "Status" field label
  ['美元',   '加元'],           // currency: USD → CAD
  ['奶油',   '加拿大地产协会'], // CREA mistranslated as "cream"
  ['旅行',   '看房'],           // "Tour" mistranslated as "travel"
  ['直播看房', '看房直播'],     // "Live Tour" word order fix
  ['直播参观', '看房直播'],     // alternate Google output for "Live Tour"
  ['现场参观', '看房直播'],     // another possible Google output for "Live Tour"
  ['标题状态', '产权状态'],     // "Title Status" — Title mistranslated as heading
  ['所有权状态', '产权状态'],   // alternate for Title Status
  ['扫描以查看属性', '扫码查看房源'],  // "Scan to view property" Google mistranslation
  ['扫描查看属性',  '扫码查看房源'],
  ['扫描以查看财产', '扫码查看房源'],
];

function applyFixes(root) {
  const base = root || document.body;
  if (!base) return;
  const walker = document.createTreeWalker(base, NodeFilter.SHOW_TEXT);
  const batch = [];
  let node;
  while ((node = walker.nextNode())) {
    const el = node.parentElement;
    if (!el || el.closest('script,style,.notranslate,[translate="no"]')) continue;
    let t = node.textContent;
    let changed = false;
    for (const [from, to] of ZH_FIXES) {
      if (t.includes(from)) { t = t.split(from).join(to); changed = true; }
    }
    if (changed) batch.push([node, t]);
  }
  // Mutate after walking to avoid invalidating the TreeWalker
  for (const [n, t] of batch) n.textContent = t;
}

let _observer = null;
let _pendingFix = null;

function startObserver() {
  if (_observer) return;
  _observer = new MutationObserver(() => {
    // Debounce so rapid DOM updates don't cause repeated full-page walks
    clearTimeout(_pendingFix);
    _pendingFix = setTimeout(() => { applyFixes(document.body); _pendingFix = null; }, 120);
  });
  _observer.observe(document.body, { childList: true, subtree: true });
}

function stopObserver() {
  clearTimeout(_pendingFix);
  _pendingFix = null;
  if (_observer) { _observer.disconnect(); _observer = null; }
}

// ── Component ──────────────────────────────────────────────────────────────────

const LangToggle = () => {
  const [lang, setLang] = useState(currentLang);

  // If the page was loaded while Chinese was active, re-attach the script
  useEffect(() => {
    if (lang === 'zh') {
      setCookie('/en/zh-CN');
      loadGoogleTranslate((combo) => {
        combo.value = 'zh-CN';
        combo.dispatchEvent(new Event('change'));
        setTimeout(() => { applyFixes(document.body); startObserver(); }, 800);
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const activate = useCallback(() => {
    setCookie('/en/zh-CN');
    localStorage.setItem('tourit_lang', 'zh');
    setLang('zh');
    window.dispatchEvent(new CustomEvent('tourit:lang', { detail: 'zh' }));
    loadGoogleTranslate((combo) => {
      combo.value = 'zh-CN';
      combo.dispatchEvent(new Event('change'));
      setTimeout(() => { applyFixes(document.body); startObserver(); }, 800);
    });
  }, []);

  const deactivate = useCallback(() => {
    // Clear all Google state, then do a clean navigation.
    // The page reloads WITHOUT the Google script (it's not in index.html),
    // so there is nothing left to re-translate.
    stopObserver();
    clearCookies();
    localStorage.setItem('tourit_lang', 'en');
    window.__gtLoaded = false; // allow re-load if user switches back to zh
    window.location.href = window.location.pathname + window.location.search;
  }, []);

  return (
    <button
      className="notranslate lang-toggle-btn"
      onClick={lang === 'zh' ? deactivate : activate}
      title={lang === 'zh' ? 'Switch to English' : '切换为中文'}
    >
      {lang === 'zh' ? 'EN' : '中文'}
    </button>
  );
};

export default LangToggle;
