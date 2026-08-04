import { useState, useEffect } from 'react';

const LogoBrand = ({ agentName, agentPhoto }) => {
	const [lang, setLang] = useState(() => { const s = localStorage.getItem('tourit_lang'); return s === 'en' ? 'en' : 'zh'; });

	useEffect(() => {
		const handler = (e) => setLang(e.detail);
		window.addEventListener('tourit:lang', handler);
		return () => window.removeEventListener('tourit:lang', handler);
	}, []);

	const brandStyle = { fontFamily: "'Outfit', 'DM Sans', system-ui, sans-serif", letterSpacing: '0.01em' };
	const spanCls = "text-[22px] md:text-[26px] leading-none";
	const goldStyle = { color: '#dfba73' };
	const whiteStyle = { color: '#ffffff', opacity: 0.85 };

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
					? <span className="nav-slogan notranslate">轻松看房，省心安家。</span>
					: <span className="nav-slogan">Home Tour Simplified.</span>
				}
			</div>
		);
	}

	return (
		<div className="flex flex-col items-center md:flex-row md:items-baseline md:gap-2 notranslate">
			<div className="flex items-center gap-1">
				<span style={{ ...brandStyle, ...goldStyle, fontWeight: 700 }} className={spanCls}>加家团队</span>
				<span style={{ ...brandStyle, ...whiteStyle, fontWeight: 300, fontSize: '14px', margin: '0 2px' }}>·</span>
				<span style={{ ...brandStyle, ...whiteStyle, fontWeight: 400, fontSize: '14px' }}>Canada Home</span>
			</div>
			{lang === 'zh'
				? <span className="nav-slogan notranslate" style={{ color: 'rgba(255,255,255,0.6)', fontSize: '11px' }}>万锦 · 列治文山</span>
				: <span className="nav-slogan" style={{ color: 'rgba(255,255,255,0.6)', fontSize: '11px' }}>Markham · Richmond Hill</span>
			}
		</div>
	);
};

export default LogoBrand;
