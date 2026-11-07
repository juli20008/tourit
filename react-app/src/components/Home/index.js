import React, { useRef } from "react";
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
            大多伦多专业华人地产经纪团队&nbsp;&nbsp;·&nbsp;&nbsp;普通话&nbsp;·&nbsp;English
          </p>

          <div className="hp-hero-actions">
            <Link to={MAP_URL} className="hp-btn hp-btn-gold">开始找房</Link>
            <a href={DETACHED_REPORT_URL} target="_blank" rel="noopener noreferrer" className="hp-btn hp-btn-outline">市场报告</a>
            <a href={CALENDLY_URL} target="_blank" rel="noopener noreferrer" className="hp-btn hp-btn-ghost">📅 立即咨询</a>
          </div>

          <div className="hp-hero-stats">
            <Stat num="100+" label="成交记录" />
            <div className="hp-stat-div" />
            <Stat num="10+" label="年从业经验" />
            <div className="hp-stat-div" />
            <Stat num="GTA" label="全区域覆盖" />
            <div className="hp-stat-div" />
            <Stat num="24/7" label="华语服务" />
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
          <SectionHead title="我们的服务" sub="专业、贴心、全程中文服务" />
          <div className="hp-services-grid">
            <ServiceCard
              icon="🏠"
              title="买房置业"
              en="Buy a Home"
              desc="从选区域、看房到过户，全程中文服务，为您在大多伦多找到理想的家。"
              cta="预约咨询"
              href={CALENDLY_URL}
            />
            <ServiceCard
              icon="🔑"
              title="出售房产"
              en="Sell Your Home"
              desc="精准市场定价、专业摄影、小红书营销推广，帮您快速高价成交。"
              cta="预约评估"
              href={CALENDLY_URL}
            />
            <ServiceCard
              icon="🏘️"
              title="出租物业 · 租房管理"
              en="Leasing & Property Management"
              desc="帮您出租房产、筛选优质租客，签约、收租、维修一站式管理，省心又安心。"
              cta="咨询出租"
              href={CALENDLY_URL}
            />
            <ServiceCard
              icon="📈"
              title="投资规划"
              en="Investment"
              desc="数据驱动决策，深度分析大多伦多各区涨幅潜力，助您实现资产增值。"
              cta="咨询团队"
              href={CALENDLY_URL}
            />
            <div className="hp-service-card hp-service-market">
              <div className="hp-service-icon">📊</div>
              <h3 className="hp-service-title">
                市场观察
                <span className="hp-service-en" translate="no">Market Insights</span>
              </h3>
              <p className="hp-service-desc">大多伦多最新楼市数据与趋势，价格走势、成交数据一目了然。</p>
              <div className="hp-service-market-links">
                <a href={DETACHED_REPORT_URL}
                   target="_blank" rel="noopener noreferrer" className="hp-service-cta">🏡 独立屋市场 →</a>
                <a href="https://claude.ai/artifact/AUTXnogN1bo4jD7u7Gbdpz"
                   target="_blank" rel="noopener noreferrer" className="hp-service-cta">🏢 公寓市场 →</a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Property Search ──────────────────────────────────────────── */}
      <section className="hp-section hp-search-band" ref={searchRef} id="search">
        <div className="hp-inner hp-search-inner">
          <div className="hp-search-text">
            <div className="hp-label">实时 MLS 数据</div>
            <h2 className="hp-section-title hp-white">搜索大多伦多房源</h2>
            <p className="hp-section-sub hp-white-sub">
              地图找房 · 价格筛选 · 户型选择 · 一站式查看全区挂牌
            </p>
            <div className="hp-search-chips">
              <SearchChip to={MAP_URL + "?type=house"}    label="独立屋 House" />
              <SearchChip to={MAP_URL + "?type=condo"}    label="公寓 Condo" />
              <SearchChip to={MAP_URL + "?type=townhouse"} label="联排 Townhouse" />
              <SearchChip to={MAP_URL + "?tx=rent"}       label="出租 For Rent" />
            </div>
            <Link to={MAP_URL} className="hp-btn hp-btn-gold hp-btn-lg">
              打开地图找房 →
            </Link>
          </div>
          <div className="hp-search-preview">
            <img src={skyline} alt="大多伦多房源" className="hp-skyline" />
            <div className="hp-search-card-float">
              <div className="hp-float-row">
                <span className="hp-float-dot hp-dot-green" />
                <span>实时 MLS 数据更新</span>
              </div>
              <div className="hp-float-row">
                <span className="hp-float-dot hp-dot-gold" />
                <span>8,000+ 在售房源</span>
              </div>
              <div className="hp-float-row">
                <span className="hp-float-dot hp-dot-green" />
                <span>全大多伦多地区覆盖</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Why Us ───────────────────────────────────────────────────── */}
      <section className="hp-section hp-why">
        <div className="hp-inner">
          <SectionHead title="为什么选择加家团队" sub="专业实力 · 华语服务 · 本地经验" />
          <div className="hp-why-grid">
            <WhyCard icon="🗣️" title="华语全程服务"
              desc="普通话、英语无缝切换。买房、卖房过程中的每一步，都有团队全程中文陪同。" />
            <WhyCard icon="🏆" title="资深专业团队"
              desc="隶属 Bay Street Group Inc. Brokerage，多位持牌经纪，覆盖大多伦多全区域。" />
            <WhyCard icon="📍" title="深耕大多伦多"
              desc="万锦、列治文山、多伦多、北约克、旺市深度熟悉，为您提供最精准的本地市场建议。" />
            <WhyCard icon="📊" title="数据驱动决策"
              desc="实时市场分析、成交价对比、涨幅热力图，助您做出最明智的地产决策。" />
          </div>
        </div>
      </section>

      {/* ── Areas ────────────────────────────────────────────────────── */}
      <section className="hp-section hp-areas">
        <div className="hp-inner">
          <SectionHead title="服务区域" sub="大多伦多全覆盖" />
          <div className="hp-areas-grid">
            {[
              { name: "万锦 Markham",        tag: "华人热门区" },
              { name: "列治文山 Richmond Hill", tag: "顶级学区" },
              { name: "多伦多 Toronto",       tag: "市中心核心" },
              { name: "北约克 North York",    tag: "性价比之选" },
              { name: "旺市 Vaughan",         tag: "新盘热区" },
              { name: "奥克维尔 Oakville",    tag: "西区首选" },
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
            <div className="hp-label hp-label-gold">微信 · 电话 · 邮件</div>
            <h2 className="hp-section-title hp-white">随时开始您的找房之旅</h2>
            <p className="hp-section-sub hp-white-sub">
              扫描微信二维码，或直接拨打电话，我们将在24小时内与您联系。
            </p>
            <div className="hp-contact-links">
              <a href="tel:6475426760"               className="hp-contact-link" translate="no">📞 647-542-6760</a>
              <a href="tel:9059090202"               className="hp-contact-link">📠 905-909-0202 (Fax)</a>
              <a href="mailto:CanadaHome.realtor@gmail.com" className="hp-contact-link" translate="no">✉️ CanadaHome.realtor@gmail.com</a>
              <span className="hp-contact-link">📍 8300 Woodbine Ave Ste 500, Markham ON L3R9Y7</span>
            </div>
            <Link to={MAP_URL} className="hp-btn hp-btn-gold" style={{ marginTop: "2rem" }}>
              开始找房
            </Link>
          </div>
          <div className="hp-contact-qr">
            <img src={wechatQr} alt="微信二维码 — 加家地产 Julie" className="hp-qr" />
            <p className="hp-qr-caption">微信扫码添加好友</p>
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
  return (
    <div className="hp-agent">
      <img src={photo} alt={name} className="hp-agent-photo" />
      <h3 className="hp-agent-name" translate="no">{name}</h3>
      <p className="hp-agent-role">Sales Representative</p>
      <a href={`tel:${phone.replace(/\D/g, "")}`} className="hp-agent-phone" translate="no">📞 {phone}</a>
      <a href={wechatUrl} target="_blank" rel="noopener noreferrer" className="hp-agent-wechat">
        <img src={wechatQr} alt={`${name} 微信二维码`} />
        <span>微信扫码添加</span>
      </a>
    </div>
  );
}
