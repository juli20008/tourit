import { useState, useEffect } from 'react';

const LogoBrand = ({ agentName, agentPhoto }) => {
	const [lang, setLang] = useState(() => localStorage.getItem('tourit_lang') || 'en');

	useEffect(() => {
		const handler = (e) => setLang(e.detail);
		window.addEventListener('tourit:lang', handler);
		return () => window.removeEventListener('tourit:lang', handler);
	}, []);

	const brandStyle = { fontFamily: "'Outfit', 'DM Sans', system-ui, sans-serif", letterSpacing: '0.01em' };
	const spanCls = "text-[24px] md:text-[30px] leading-none text-white";

	if (agentName) {
		return (
			<div className="flex flex-col items-center md:flex-row md:items-baseline md:gap-3">
				<div className="flex items-center gap-2 notranslate">
					{lang === 'zh' ? (
						<>
							<span style={{ ...brandStyle, fontWeight: 400 }} className={spanCls}>和</span>
							<span style={{ ...brandStyle, fontWeight: 400 }} className={spanCls}>{agentName}</span>
							<span style={{ ...brandStyle, fontWeight: 400 }} className={spanCls}>一起看房</span>
						</>
					) : (
						<>
							<span style={{ ...brandStyle, fontWeight: 400 }} className={spanCls}>tour it with</span>
							<span style={{ ...brandStyle, fontWeight: 400 }} className={spanCls}>{agentName}</span>
						</>
					)}
					{agentPhoto && (
						<img
							src={agentPhoto}
							alt={agentName}
							style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }}
						/>
					)}
				</div>
				{lang === 'zh'
					? <span className="nav-slogan notranslate">图它 - 就图它看房方便和省心！</span>
					: <span className="nav-slogan">Home Tour Simplified.</span>
				}
			</div>
		);
	}

	return (
		<div className="flex flex-col items-center md:flex-row md:items-baseline md:gap-3">
			<div className="flex items-center gap-2">
				<span
					style={{ ...brandStyle, fontWeight: 400 }}
					className={spanCls}
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
