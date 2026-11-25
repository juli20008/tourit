import React, { useEffect, useRef } from "react";
import setSeo from "../../utils/seo";
import { useT } from "../../utils/lang";
import { Link } from "react-router-dom";
import "../../css/home.css";

import houseBg    from "../../assets/house-bg.jpeg";
import skyline    from "../../assets/about/skyline.png";
import julie      from "../../assets/team/julie.jpg";
import sara       from "../../assets/team/sara.jpg";
import julieWechat from "../../assets/team/julie_wechat.png";
import saraWechat  from "../../assets/team/sara_wechat.png";
import wechatQr   from "../../assets/wechat_qr.jpg";
import bayLogo    from "../../assets/bay-logo-gold.png";

const MAP_URL = "/area/neLat=43.885&neLng=-79.285&swLat=43.850&swLng=-79.335&zoom=14";
const CALENDLY_URL = "https://calendly.com/julie-li-realtor/";
const DETACHED_REPORT_URL = "https://claude.ai/artifact/VZCKf79qzXmm8AZLiWXHJx";

export default function Home() {
  const t = useT();
  useEffect(() => { setSeo({ path: "/" }); }, []);
  const searchRef = useRef(null);

  return (
    <div className="hp" translate="no">

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="hp-hero" style={{ backgroundImage: `url(${houseBg})` }}>
        <div className="hp-hero-overlay" />
        <div className="hp-hero-body">
          <div className="hp-hero-main">
          <div className="hp-hero-brand" translate="no">
            <img src={bayLogo} alt="Bay Street Group Inc., Brokerage" className="hp-hero-bay" />
            <span className="hp-hero-brand-div" />
            <span className="hp-hero-brand-note">TRREB<br />Member</span>
          </div>

          <h1 className="hp-hero-title">
            <span className="hp-hero-cn">加家团队</span>
            <span className="hp-hero-en" translate="no">Canada Home Team</span>
          </h1>

          <p className="hp-hero-sub">
            {t("大多伦多专业华人地产经纪团队  ·  普通话 · English", "Chinese-speaking real estate team in the Greater Toronto Area  ·  Mandarin · English")}
          </p>

          <div className="hp-hero-actions">
            <Link to={MAP_URL} className="hp-btn hp-btn-gold">{t("开始找房", "Find a Home")}</Link>
            <a href={DETACHED_REPORT_URL} target="_blank" rel="noopener noreferrer" className="hp-btn hp-btn-outline">{t("市场报告", "Market Report")}</a>
            <a href={CALENDLY_URL} target="_blank" rel="noopener noreferrer" className="hp-btn hp-btn-ghost">📅 {t("立即咨询", "Book a Consultation")}</a>
          </div>

          <div className="hp-hero-stats">
            <Stat num={t("买·卖·租", "Buy·Sell·Lease")} label={t("资深经纪", "Experienced agents")} />
            <div className="hp-stat-div" />
            <Stat num="10+" label={t("年从业经验", "Years of experience")} />
            <div className="hp-stat-div" />
            <Stat num="GTA" label={t("全区域覆盖", "Area-wide coverage")} />
            <div className="hp-stat-div" />
            <Stat num="24/7" label={t("华语服务", "Here for you")} />
          </div>
          </div>

          <div className="hp-hero-agents">
            <HeroAgent
              photo={julie}
              name="Julie Li"
              phone="647-542-6760"
              wechatQr={julieWechat}
              wechatUrl="https://u.wechat.com/kOjsmfi4TK7gT0ysUXBa_sw?s=2"
            />
            <HeroAgent
              photo={sara}
              name="Sara Tian"
              phone="647-824-4898"
              wechatQr={saraWechat}
              wechatUrl="https://u.wechat.com/IPNM0pzVn9DDpmt5tCEBdZw"
            />
          </div>
        </div>

        {/* scroll cue */}
        <div className="hp-scroll-cue">
          <span className="hp-scroll-arrow">↓</span>
        </div>
      </section>

      {/* ── Services ─────────────────────────────────────────────────── */}
      <section className="hp-section hp-services">
        <div className="hp-inner">
          <SectionHead title={t("我们的服务", "Our Services")} sub={t("专业、贴心、全程中文服务", "Professional, attentive, in Mandarin or English")} />
          <div className="hp-services-grid">
            <ServiceCard
              icon="🏠"
              title={t("买房置业", "Buy a Home")}
              en="Buy a Home"
              desc={t("从选区域、看房到过户，全程中文服务，为您在大多伦多找到理想的家。", "From choosing a neighbourhood to showings and closing, we guide you every step to find the right home in the GTA.")}
              cta={t("预约咨询", "Book a consultation")}
              href={CALENDLY_URL}
            />
            <ServiceCard
              icon="🔑"
              title={t("出售房产", "Sell Your Home")}
              en="Sell Your Home"
              desc={t("精准市场定价、专业摄影、小红书营销推广，帮您快速高价成交。", "Accurate pricing, professional photography and social-media marketing to sell fast and for top dollar.")}
              cta={t("预约评估", "Get a home evaluation")}
              href={CALENDLY_URL}
            />
            <ServiceCard
              icon="🏘️"
              title={t("出租物业 · 租房管理", "Leasing & Property Management")}
              en="Leasing & Property Management"
              desc={t("帮您出租房产、筛选优质租客，签约、收租、维修一站式管理，省心又安心。", "We lease your property, screen quality tenants, and handle leases, rent collection and repairs, worry-free.")}
              cta={t("咨询出租", "Ask about leasing")}
              href={CALENDLY_URL}
            />
            <ServiceCard
              icon="📈"
              title={t("投资规划", "Investment Planning")}
              en="Investment"
              desc={t("数据驱动决策，深度分析大多伦多各区涨幅潜力，助您实现资产增值。", "Data-driven decisions: we analyse growth potential across GTA neighbourhoods to help your assets appreciate.")}
              cta={t("咨询团队", "Talk to our team")}
              href={CALENDLY_URL}
            />
            <div className="hp-service-card hp-service-market">
              <div className="hp-service-icon">📊</div>
              <h3 className="hp-service-title">
                {t("市场观察", "Market Insights")}
                <span className="hp-service-en" translate="no">Market Insights</span>
              </h3>
              <p className="hp-service-desc">{t("大多伦多最新楼市数据与趋势，价格走势、成交数据一目了然。", "The latest GTA market data and trends: prices and sales at a glance.")}</p>
              <div className="hp-service-market-links">
                <a href={DETACHED_REPORT_URL}
                   target="_blank" rel="noopener noreferrer" className="hp-service-cta">🏡 {t("独立屋市场", "Detached homes")} →</a>
                <a href="https://claude.ai/artifact/AUTXnogN1bo4jD7u7Gbdpz"
                   target="_blank" rel="noopener noreferrer" className="hp-service-cta">🏢 {t("公寓市场", "Condos")} →</a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Property Search ──────────────────────────────────────────── */}
      <section className="hp-section hp-search-band" ref={searchRef} id="search">
        <div className="hp-inner hp-search-inner">
          <div className="hp-search-text">
            <div className="hp-label">{t("实时 MLS 数据", "Live MLS data")}</div>
            <h2 className="hp-section-title hp-white">{t("搜索大多伦多房源", "Search GTA Listings")}</h2>
            <p className="hp-section-sub hp-white-sub">
              {t("地图找房 · 价格筛选 · 户型选择 · 一站式查看全区挂牌", "Map search · Price filters · Property types · All listings in one place")}
            </p>
            <div className="hp-search-chips">
              <SearchChip to={MAP_URL + "?type=house"}    label={t("独立屋 House", "Detached")} />
              <SearchChip to={MAP_URL + "?type=condo"}    label={t("公寓 Condo", "Condo")} />
              <SearchChip to={MAP_URL + "?type=townhouse"} label={t("联排 Townhouse", "Townhouse")} />
              <SearchChip to={MAP_URL + "?tx=rent"}       label={t("出租 For Rent", "For Rent")} />
            </div>
            <Link to={MAP_URL} className="hp-btn hp-btn-gold hp-btn-lg">
              {t("打开地图找房 →", "Open map search →")}
            </Link>
          </div>
          <div className="hp-search-preview">
            <img src={skyline} alt={t("大多伦多房源", "GTA listings")} className="hp-skyline" />
            <div className="hp-search-card-float">
              <div className="hp-float-row">
                <span className="hp-float-dot hp-dot-green" />
                <span>{t("实时 MLS 数据更新", "Live MLS updates")}</span>
              </div>
              <div className="hp-float-row">
                <span className="hp-float-dot hp-dot-gold" />
                <span>{t("8,000+ 在售房源", "8,000+ active listings")}</span>
              </div>
              <div className="hp-float-row">
                <span className="hp-float-dot hp-dot-green" />
                <span>{t("全大多伦多地区覆盖", "Covering the entire GTA")}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Why Us ───────────────────────────────────────────────────── */}
      <section className="hp-section hp-why">
        <div className="hp-inner">
          <SectionHead title={t("为什么选择加家团队", "Why Canada Home Team")} sub={t("专业实力 · 华语服务 · 本地经验", "Expertise · Bilingual service · Local knowledge")} />
          <div className="hp-why-grid">
            <WhyCard icon="🗣️" title={t("华语全程服务", "Mandarin & English")}
              desc={t("普通话、英语无缝切换。买房、卖房过程中的每一步，都有团队全程中文陪同。", "We switch seamlessly between Mandarin and English and are with you at every step of buying or selling.")} />
            <WhyCard icon="🏆" title={t("资深专业团队", "Experienced Team")}
              desc={t("隶属 Bay Street Group Inc. Brokerage，多位持牌经纪，覆盖大多伦多全区域。", "Licensed sales representatives with Bay Street Group Inc., Brokerage, serving the entire GTA.")} />
            <WhyCard icon="📍" title={t("深耕大多伦多", "Deep Local Knowledge")}
              desc={t("万锦、列治文山、多伦多、北约克、旺市深度熟悉，为您提供最精准的本地市场建议。", "We know Markham, Richmond Hill, Toronto, North York and Vaughan inside out, so our advice is precise and local.")} />
            <WhyCard icon="📊" title={t("数据驱动决策", "Data-Driven Decisions")}
              desc={t("实时市场分析、成交价对比、涨幅热力图，助您做出最明智的地产决策。", "Live market analysis, sold-price comparisons and growth heat maps help you make the smartest decision.")} />
          </div>
        </div>
      </section>

      {/* ── Areas ────────────────────────────────────────────────────── */}
      <section className="hp-section hp-areas">
        <div className="hp-inner">
          <SectionHead title={t("服务区域", "Areas We Serve")} sub={t("大多伦多全覆盖", "Across the Greater Toronto Area")} />
          <div className="hp-areas-grid">
            {[
              { name: t("万锦 Markham", "Markham"),        tag: t("华人热门区", "Popular with Chinese families") },
              { name: t("列治文山 Richmond Hill", "Richmond Hill"), tag: t("顶级学区", "Top-ranked schools") },
              { name: t("多伦多 Toronto", "Toronto"),       tag: t("市中心核心", "Downtown core") },
              { name: t("北约克 North York", "North York"),    tag: t("性价比之选", "Great value") },
              { name: t("旺市 Vaughan", "Vaughan"),         tag: t("新盘热区", "New developments") },
              { name: t("奥克维尔 Oakville", "Oakville"),    tag: t("西区首选", "Top west-end pick") },
            ].map((a) => (
              <Link key={a.name} to={MAP_URL} className="hp-area-card">
                <span className="hp-area-tag">{a.tag}</span>
                <span className="hp-area-name" translate="no">{a.name}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Contact / WeChat ─────────────────────────────────────────── */}
      <section className="hp-section hp-contact">
        <div className="hp-inner hp-contact-inner">
          <div className="hp-contact-text">
            <img src={bayLogo} alt="Bay Street Group Inc., Brokerage" className="hp-contact-bay" />
            <div className="hp-label hp-label-gold">{t("微信 · 电话 · 邮件", "WeChat · Phone · Email")}</div>
            <h2 className="hp-section-title hp-white">{t("随时开始您的找房之旅", "Start Your Home Search Today")}</h2>
            <p className="hp-section-sub hp-white-sub">
              {t("扫描微信二维码，或直接拨打电话，我们将在24小时内与您联系。", "Scan our WeChat QR code or call us, and we will get back to you within 24 hours.")}
            </p>
            <div className="hp-contact-links">
              <a href="tel:6475426760"               className="hp-contact-link" translate="no">📞 647-542-6760</a>
              <a href="tel:9059090202"               className="hp-contact-link">📠 905-909-0202 (Fax)</a>
              <a href="mailto:CanadaHome.realtor@gmail.com" className="hp-contact-link" translate="no">✉️ CanadaHome.realtor@gmail.com</a>
              <span className="hp-contact-link">📍 8300 Woodbine Ave Ste 500, Markham ON L3R9Y7</span>
            </div>
            <Link to={MAP_URL} className="hp-btn hp-btn-gold" style={{ marginTop: "2rem" }}>
              {t("开始找房", "Find a Home")}
            </Link>
          </div>
          <div className="hp-contact-qr">
            <img src={wechatQr} alt={t("微信二维码 — 加家地产 Julie", "WeChat QR code — Julie")} className="hp-qr" />
            <p className="hp-qr-caption">{t("微信扫码添加好友", "Scan to add us on WeChat")}</p>
          </div>
        </div>
      </section>

    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────────────────────────── */

function Stat({ num, label }) {
  return (
    <div className="hp-stat">
      <span className="hp-stat-num" translate="no">{num}</span>
      <span className="hp-stat-label">{label}</span>
    </div>
  );
}

function SectionHead({ title, sub }) {
  return (
    <div className="hp-section-head">
      <h2 className="hp-section-title">{title}</h2>
      <p className="hp-section-sub">{sub}</p>
    </div>
  );
}

function ServiceCard({ icon, title, en, desc, cta, to, href }) {
  const inner = (
    <div className="hp-service-card">
      <div className="hp-service-icon">{icon}</div>
      <h3 className="hp-service-title">
        {title}
        <span className="hp-service-en" translate="no">{en}</span>
      </h3>
      <p className="hp-service-desc">{desc}</p>
      <span className="hp-service-cta">{cta} →</span>
    </div>
  );
  if (to) return <Link to={to} className="hp-service-link">{inner}</Link>;
  const external = href && href.startsWith("http");
  return (
    <a href={href} className="hp-service-link"
       {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
      {inner}
    </a>
  );
}

function SearchChip({ to, label }) {
  return <Link to={to} className="hp-chip">{label}</Link>;
}

function WhyCard({ icon, title, desc }) {
  return (
    <div className="hp-why-card">
      <div className="hp-why-icon">{icon}</div>
      <h3 className="hp-why-title">{title}</h3>
      <p className="hp-why-desc">{desc}</p>
    </div>
  );
}

function HeroAgent({ photo, name, phone, wechatQr, wechatUrl }) {
  const t = useT();
  return (
    <div className="hp-agent">
      <img src={photo} alt={name} className="hp-agent-photo" />
      <h3 className="hp-agent-name" translate="no">{name}</h3>
      <p className="hp-agent-role">Sales Representative</p>
      <a href={`tel:${phone.replace(/\D/g, "")}`} className="hp-agent-phone" translate="no">📞 {phone}</a>
      <a href={wechatUrl} target="_blank" rel="noopener noreferrer" className="hp-agent-wechat">
        <img src={wechatQr} alt={`${name} ${t("微信二维码", "WeChat QR code")}`} />
        <span>{t("微信扫码添加", "Scan to add on WeChat")}</span>
      </a>
    </div>
  );
}
