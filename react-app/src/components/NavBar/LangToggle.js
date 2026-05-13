import React, { useState, useCallback } from 'react';

function currentLang() {
  const stored = localStorage.getItem('tourit_lang');
  if (stored === 'zh' || stored === 'en') return stored;
  return 'en';
}

const LangToggle = () => {
  const [lang, setLang] = useState(currentLang);

  const getCombo = () => document.querySelector('.goog-te-combo');

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
    const combo = getCombo();
    if (combo) {
      // Setting value to '' tells Google Translate to show the original language
      combo.value = '';
      combo.dispatchEvent(new Event('change'));
    }
    localStorage.setItem('tourit_lang', 'en');
    setLang('en');
  }, []);

  return null; // temporarily hidden
};

export default LangToggle;
