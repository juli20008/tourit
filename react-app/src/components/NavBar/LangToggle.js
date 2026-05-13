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
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const activate = useCallback(() => {
    setCookie('/en/zh-CN');
    localStorage.setItem('tourit_lang', 'zh');
    setLang('zh');
    loadGoogleTranslate((combo) => {
      combo.value = 'zh-CN';
      combo.dispatchEvent(new Event('change'));
    });
  }, []);

  const deactivate = useCallback(() => {
    // Clear all Google state, then do a clean navigation.
    // The page reloads WITHOUT the Google script (it's not in index.html),
    // so there is nothing left to re-translate.
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
