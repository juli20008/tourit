import React, { useState, useCallback } from 'react';

function currentLang() {
  const c = document.cookie.split(';').find(s => s.trim().startsWith('googtrans='));
  return c && c.includes('zh') ? 'zh' : 'en';
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
        setLang('zh');
      } else if (retries > 0) {
        setTimeout(() => attempt(retries - 1), 100);
      }
    };
    attempt();
  }, []);

  const deactivate = useCallback(() => {
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
