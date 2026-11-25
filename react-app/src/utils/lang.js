import { useEffect, useState } from "react";

// Current site language, matching the EN / 中文 toggle (LangToggle):
// default Chinese, "en" only after the visitor clicks EN.
export const getLang = () => (localStorage.getItem("tourit_lang") === "en" ? "en" : "zh");

/** const t = useT();  t("中文", "English") → text for the current language. */
export function useT() {
	const [lang, setLang] = useState(getLang);
	useEffect(() => {
		const sync = () => setLang(getLang());
		window.addEventListener("tourit:lang", sync);   // fired by LangToggle when switching to 中文
		window.addEventListener("storage", sync);
		return () => {
			window.removeEventListener("tourit:lang", sync);
			window.removeEventListener("storage", sync);
		};
	}, []);
	const t = (zh, en) => (lang === "en" ? en : zh);
	t.lang = lang;
	return t;
}
