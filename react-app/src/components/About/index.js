const TEAM_PHOTO = 'https://pub-d254d778630548a18efd333eda056bcb.r2.dev/assets/team-hero.png';
const WECHAT_QR  = 'https://pub-d254d778630548a18efd333eda056bcb.r2.dev/assets/wechat-qr.jpg';

const agents = [
	{
		initials: 'JL',
		zh: 'Julie Li',
		en: 'Julie Li',
		title_zh: '地产销售代表',
		title_en: 'Sales Representative',
		phone: '647.542.6760',
		langs: '普通话 · English',
	},
	{
		initials: 'ST',
		zh: 'Sara Tian',
		en: 'Sara Tian',
		title_zh: '地产销售代表',
		title_en: 'Sales Representative',
		phone: '647.824.4898',
		langs: '普通话 · English',
	},
];

const stats = [
	{ num: '10+', label_zh: '年专业经验', label_en: 'Years Experience' },
	{ num: '500+', label_zh: '成功成交', label_en: 'Homes Sold' },
	{ num: '2', label_zh: '专注城市', label_en: 'Core Markets' },
	{ num: '双语', label_zh: '中英文服务', label_en: 'Bilingual Service' },
];

const About = () => {
	return (
		<div className="about-page">

			{/* ── Hero ── */}
			<div className="about-hero">
				<img className="about-hero-bg" src={TEAM_PHOTO} alt="" aria-hidden="true" />
				<div className="about-hero-overlay" />
				<div className="about-hero-content">
					<p className="about-hero-kicker">Bay Street Group Inc. Brokerage</p>
					<h1 className="about-hero-title">
						<span className="about-hero-zh">加家团队</span>
						<span className="about-hero-divider">·</span>
						<span className="about-hero-en">Canada Home Team</span>
					</h1>
					<p className="about-hero-sub">
						专注万锦 &amp; 列治文山的专业华人地产团队<br />
						<span style={{ opacity: 0.75 }}>Markham &amp; Richmond Hill's Trusted Real Estate Team</span>
					</p>
				</div>
			</div>

			{/* ── Stats bar ── */}
			<div className="about-stats-bar">
				{stats.map((s) => (
					<div key={s.num} className="about-stat">
						<div className="about-stat-num">{s.num}</div>
						<div className="about-stat-label">
							<span>{s.label_zh}</span>
							<span className="about-stat-en">{s.label_en}</span>
						</div>
					</div>
				))}
			</div>

			{/* ── Mission ── */}
			<section className="about-section about-mission-section">
				<div className="about-section-inner">
					<div className="about-section-tag">关于我们 / About Us</div>
					<h2 className="about-section-title">我们是谁</h2>
					<div className="about-mission-body">
						<p>
							加家团队（Canada Home Team）是一支深耕大多伦多地区的专业华人地产团队，
							由 Julie Li 和 Sara Tian 联合创立，隶属于
							<strong> Bay Street Group Inc. Brokerage</strong>。
							我们专注万锦市（Markham）与列治文山市（Richmond Hill），
							为华人买家和卖家提供全程双语地产服务。
						</p>
						<p>
							We are a bilingual real estate team rooted in the Greater Toronto Area,
							specializing in <strong>Markham</strong> and <strong>Richmond Hill</strong>.
							From your first home search to the final closing, we guide you every step of the way —
							in both Mandarin and English.
						</p>
					</div>
				</div>
			</section>

			{/* ── Team ── */}
			<section className="about-section about-team-section">
				<div className="about-section-inner">
					<div className="about-section-tag">我们的团队 / The Team</div>
					<h2 className="about-section-title">认识我们</h2>
					<div className="about-agents-grid">
						{agents.map((a) => (
							<div key={a.initials} className="about-agent-card">
								<div className="about-agent-avatar">{a.initials}</div>
								<div className="about-agent-info">
									<div className="about-agent-name">{a.zh}</div>
									<div className="about-agent-title">{a.title_zh} / {a.title_en}</div>
									<div className="about-agent-langs">{a.langs}</div>
									<a className="about-agent-phone" href={`tel:${a.phone.replace(/\./g, '')}`}>
										<i className="fa-solid fa-phone" style={{ fontSize: 13 }} />
										{a.phone}
									</a>
								</div>
							</div>
						))}
					</div>
				</div>
			</section>

			{/* ── WeChat ── */}
			<section className="about-section about-wechat-section">
				<div className="about-wechat-inner">
					<div className="about-wechat-text">
						<div className="about-section-tag" style={{ color: 'var(--brand-gold)' }}>联系我们 / Connect</div>
						<h2 className="about-section-title" style={{ color: '#fff' }}>微信扫码联系我们</h2>
						<p className="about-wechat-desc">
							扫描右侧二维码，添加我们的微信，随时咨询买卖问题。<br />
							<span style={{ opacity: 0.72 }}>Scan the QR code to connect with us on WeChat anytime.</span>
						</p>
						<div className="about-wechat-contacts">
							<div className="about-wechat-contact">
								<i className="fa-solid fa-phone" />
								<span>Julie Li — 647.542.6760</span>
							</div>
							<div className="about-wechat-contact">
								<i className="fa-solid fa-phone" />
								<span>Sara Tian — 647.824.4898</span>
							</div>
						</div>
					</div>
					<div className="about-wechat-qr-wrap">
						<img className="about-wechat-qr" src={WECHAT_QR} alt="WeChat QR Code" />
						<p className="about-wechat-qr-label">微信扫码加好友 / Scan on WeChat</p>
					</div>
				</div>
			</section>

			{/* ── Brokerage ── */}
			<section className="about-brokerage-bar">
				<i className="fa-solid fa-building-columns about-brokerage-icon" />
				<div className="about-brokerage-info">
					<strong>Bay Street Group Inc. Brokerage</strong>
					<span>8300 Woodbine Ave, Suite 500, Markham ON L3R 9Y7</span>
					<span>加家团队 · Canada Home Team</span>
				</div>
			</section>

		</div>
	);
};

export default About;
