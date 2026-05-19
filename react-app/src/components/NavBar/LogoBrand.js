import { useState, useEffect } from 'react';

const LogoBrand = () => {
	const [lang, setLang] = useState(() => localStorage.getItem('tourit_lang') || 'en');

	useEffect(() => {
		const handler = (e) => setLang(e.detail);
		window.addEventListener('tourit:lang', handler);
		return () => window.removeEventListener('tourit:lang', handler);
	}, []);

	return (
		<div className="flex flex-col items-center md:flex-row md:items-baseline md:gap-3">
			<div className="flex items-center gap-2">
				<span
					style={{ fontFamily: "'Outfit', 'DM Sans', system-ui, sans-serif", fontWeight: 400, letterSpacing: '0.01em' }}
					className="text-[24px] md:text-[30px] leading-none text-white"
				>
					tourit.ca
				</span>
			</div>
			{lang === 'zh'
				? <span className="nav-slogan notranslate">图它 - 就图它看房方便和省心！</span>
				: <span className="nav-slogan">Home Tour Simplified.</span>
			}
		</div>
	);
};

export default LogoBrand;
