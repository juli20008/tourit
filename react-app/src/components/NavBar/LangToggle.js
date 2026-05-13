import React, { useState, useCallback } from 'react';

// localStorage is the authority — Google's cookie alone can't be trusted
// because Google re-applies translation from the cookie even after clearing it.
function currentLang() {
  const stored = localStorage.getItem('tourit_lang');
  if (stored === 'zh' || stored === 'en') return stored;
  // First visit: default English
  return 'en';
}

function clearGoogCookies() {
  const host = window.location.hostname;
  const exp  = 'expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/';
  document.cookie = `googtrans=; ${exp}`;
  document.cookie = `googtrans=; ${exp}; domain=${host}`;
  document.cookie = `googtrans=; ${exp}; domain=.${host}`;
}

const LangToggle = () => {
  const [lang, setLang] = useState(currentLang);

  const activate = useCallback(() => {
    const attempt = (retries = 30) => {
      const sel = document.querySelector('.goog-te-combo');
      if (sel) {
        sel.value = 'zh-CN';
        sel.dispatchEvent(new Event('change'));
        localStorage.setItem('tourit_lang', 'zh');
        setLang('zh');
      } else if (retries > 0) {
        setTimeout(() => attempt(retries - 1), 100);
      }
    };
    attempt();
  }, []);

  const deactivate = useCallback(() => {
    // Mark English preference BEFORE reload so googleTranslateElementInit
    // clears the cookie before Google's widget reads it.
    localStorage.setItem('tourit_lang', 'en');
    clearGoogCookies();
    window.location.reload();
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
