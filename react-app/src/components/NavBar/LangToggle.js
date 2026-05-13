import React, { useState, useCallback } from 'react';

function currentLang() {
  const stored = localStorage.getItem('tourit_lang');
  if (stored === 'zh' || stored === 'en') return stored;
  return 'en';
}

function clearGoogCookies() {
  const h   = window.location.hostname;
  const exp = 'expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/';
  document.cookie = `googtrans=; ${exp}`;
  document.cookie = `googtrans=; ${exp}; domain=${h}`;
  document.cookie = `googtrans=; ${exp}; domain=.${h}`;
}

function getCombo() {
  return document.querySelector('.goog-te-combo');
}

const LangToggle = () => {
  const [lang, setLang] = useState(currentLang);

  const activate = useCallback(() => {
    const attempt = (retries = 40) => {
      const combo = getCombo();
      if (combo) {
        combo.value = 'zh-CN';
        combo.dispatchEvent(new Event('change'));
        localStorage.setItem('tourit_lang', 'zh');
        setLang('zh');
      } else if (retries > 0) {
        setTimeout(() => attempt(retries - 1), 100);
      }
    };
    attempt();
  }, []);

  const deactivate = useCallback(() => {
    // 1. Tell Google Translate to restore original
    const combo = getCombo();
    if (combo) {
      combo.value = '';
      combo.dispatchEvent(new Event('change'));
    }

    // 2. Immediately clear the cookie — Google re-writes it after the combo
    //    change event, so we must clear it in the same tick.
    clearGoogCookies();

    // 3. Strip the translated-ltr class Google uses to track state
    document.documentElement.classList.remove('translated-ltr', 'translated-rtl');

    // 4. Persist English preference so the page-load IIFE pre-clears on reload
    localStorage.setItem('tourit_lang', 'en');
    setLang('en');
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
