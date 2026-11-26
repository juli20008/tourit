import React, { useEffect } from "react";
import setSeo from "../../utils/seo";
import { useT } from "../../utils/lang";
import { Link } from "react-router-dom";
import "../../css/home.css";

import houseBg     from "../../assets/house-bg.jpeg";
import julie       from "../../assets/team/julie.jpg";
import sara        from "../../assets/team/sara.jpg";
import julieWechat from "../../assets/team/julie_wechat.png";
import saraWechat  from "../../assets/team/sara_wechat.png";
import wechatQr    from "../../assets/wechat_qr.jpg";
import bayLogo     from "../../assets/bay-logo-gold.png";

const MAP_URL = "/area/neLat=43.885&neLng=-79.285&swLat=43.850&swLng=-79.335&zoom=14";
const CALENDLY_URL = "https://calendly.com/julie-li-realtor/";
const DETACHED_REPORT_URL = "https://claude.ai/artifact/VZCKf79qzXmm8AZLiWXHJx";
const CONDO_REPORT_URL = "https://claude.ai/artifact/AUTXnogN1bo4jD7u7Gbdpz";
const ext = { target: "_blank", rel: "noopener noreferrer" };

export default function Home() {
  const t = useT();
  useEffect(() => { setSeo({ path: "/" }); }, []);

  const services = [
    { icon: "fa-house", zh: "买房置业", en: "Buy a Home",
      dzh: "从选区域、看房到过户，全程中文服务，为您在大多伦多找到理想的家。",
      den: "From choosing a neighbourhood to showings and closing, we guide you every step to find the right home in the GTA.",
      czh: "预约咨询", cen: "Book a consultation", href: CALENDLY_URL },
    { icon: "fa-key", zh: "出售房产", en: "Sell Your Home",
      dzh: "精准市场定价、专业摄影、小红书营销推广，帮您快速高价成交。",
      den: "Accurate pricing, professional photography and social-media marketing to sell fast and for top dollar.",
      czh: "预约评估", cen: "Get a home evaluation", href: CALENDLY_URL },
    { icon: "fa-building", zh: "出租物业 · 租房管理", en: "Leasing & Management",
      dzh: "帮您出租房产、筛选优质租客，签约、收租、维修一站式管理，省心又安心。",
      den: "We lease your property, screen quality tenants, and handle leases, rent collection and repairs, worry-free.",
      czh: "咨询出租", cen: "Ask about leasing", href: CALENDLY_URL },
    { icon: "fa-chart-line", zh: "投资规划", en: "Investment Planning",
      dzh: "数据驱动决策，深度分析大多伦多各区涨幅潜力，助您实现资产增值。",
      den: "Data-driven decisions: we analyse growth potential across GTA neighbourhoods to help your assets appreciate.",
      czh: "咨询团队", cen: "Talk to our team", href: CALENDLY_URL },
  ];

  const reasons = [
    { zh: "华语全程服务", en: "Mandarin & English",
      dzh: "普通话、英语无缝切换。买房、卖房过程中的每一步，都有团队全程中文陪同。",
      den: "We switch seamlessly between Mandarin and English and are with you at every step of buying or selling." },
    { zh: "资深专业团队", en: "Experienced Team",
      dzh: "隶属 Bay Street Group Inc. Brokerage，持牌经纪，覆盖大多伦多全区域。",
      den: "Licensed sales representatives with Bay Street Group Inc., Brokerage, serving the entire GTA." },
    { zh: "深耕大多伦多", en: "Deep Local Knowledge",
      dzh: "万锦、列治文山、多伦多、北约克、旺市深度熟悉，为您提供最精准的本地市场建议。",
      den: "We know Markham, Richmond Hill, Toronto, North York and Vaughan inside out, so our advice is precise and local." },
    { zh: "数据驱动决策", en: "Data-Driven Decisions",
      dzh: "市场分析、成交价对比、区域涨幅研究，助您做出最明智的地产决策。",
      den: "Market analysis, sold-price comparisons and neighbourhood research help you make the smartest decision." },
  ];

  const areas = [
    { zh: "万锦", en: "Markham", tzh: "华人热门区", ten: "Popular with families" },
    { zh: "列治文山", en: "Richmond Hill", tzh: "顶级学区", ten: "Top-ranked schools" },
    { zh: "多伦多", en: "Toronto", tzh: "市中心核心", ten: "Downtown core" },
    { zh: "北约克", en: "North York", tzh: "性价比之选", ten: "Great value" },
    { zh: "旺市", en: "Vaughan", tzh: "新盘热区", ten: "New developments" },
    { zh: "奥克维尔", en: "Oakville", tzh: "西区首选", ten: "Top west-end pick" },
  ];

  return (
    <div className="hp" translate="no">

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="hp-hero" style={{ backgroundImage: `url(${houseBg})` }}>
        <div className="hp-hero-shade" />
        <div className="hp-hero-body">
          <div className="hp-hero-main">
            <div className="hp-hero-brand">
              <img src={bayLogo} alt="Bay Street Group Inc., Brokerage" className="hp-hero-bay" />
              <span className="hp-hero-brand-div" />
              <span className="hp-hero-brand-note">TRREB Member</span>
            </div>

            <p className="hp-eyebrow hp-eyebrow-light">
              {t("万锦 · 列治文山 · 大多伦多", "Markham · Richmond Hill · Greater Toronto")}
            </p>
            <h1 className="hp-hero-title">
              <span className="hp-hero-cn">加家团队</span>
              <span className="hp-hero-en">Canada Home Team</span>
            </h1>
            <p className="hp-hero-sub">
              {t("专业华人地产经纪团队，买房、卖房、出租，全程普通话与英语服务。",
                 "A Chinese-speaking real estate team for buying, selling and leasing, in Mandarin or English.")}
            </p>

            <div className="hp-hero-actions">
              <Link to={MAP_URL} className="hp-btn hp-btn-solid">{t("开始找房", "Find a Home")}</Link>
              <a href={DETACHED_REPORT_URL} {...ext} className="hp-btn hp-btn-line">{t("市场报告", "Market Report")}</a>
              <a href={CALENDLY_URL} {...ext} className="hp-link-arrow hp-link-light">
                {t("预约咨询", "Book a consultation")} <i className="fa-solid fa-arrow-right" />
              </a>
            </div>

            <dl className="hp-hero-facts">
              <div><dt>{t("买 · 卖 · 租", "Buy · Sell · Lease")}</dt><dd>{t("一站式服务", "Full service")}</dd></div>
              <div><dt>10+</dt><dd>{t("年从业经验", "Years of experience")}</dd></div>
              <div><dt>GTA</dt><dd>{t("全区域覆盖", "Area-wide coverage")}</dd></div>
            </dl>
          </div>

          <div className="hp-hero-agents">
            <Agent photo={julie} name="Julie Li" phone="647-542-6760"
                   wechatQr={julieWechat} wechatUrl="https://u.wechat.com/kOjsmfi4TK7gT0ysUXBa_sw?s=2" />
            <Agent photo={sara} name="Sara Tian" phone="647-824-4898"
                   wechatQr={saraWechat} wechatUrl="https://u.wechat.com/IPNM0pzVn9DDpmt5tCEBdZw" />
          </div>
        </div>
      </section>

      {/* ── Services ─────────────────────────────────────────────────── */}
      <section className="hp-section">
        <div className="hp-inner">
          <SectionHead
            eyebrow={t("服务", "Services")}
            title={t("我们的服务", "What We Do")}
            sub={t("从找房到成交，从出租到投资，一个团队全程负责。", "From the first showing to closing, from leasing to investing: one team, start to finish.")}
          />
          <div className="hp-services">
            {services.map((s, i) => (
              <a key={s.en} href={s.href} {...ext} className="hp-service">
                <span className="hp-service-no">0{i + 1}</span>
                <i className={`fa-solid ${s.icon} hp-service-icon`} />
                <h3 className="hp-service-title">{t(s.zh, s.en)}</h3>
                <p className="hp-service-desc">{t(s.dzh, s.den)}</p>
                <span className="hp-link-arrow">{t(s.czh, s.cen)} <i className="fa-solid fa-arrow-right" /></span>
              </a>
            ))}
            <div className="hp-service">
              <span className="hp-service-no">05</span>
              <i className="fa-solid fa-chart-column hp-service-icon" />
              <h3 className="hp-service-title">{t("市场观察", "Market Insights")}</h3>
              <p className="hp-service-desc">{t("大多伦多最新楼市数据与趋势，价格走势、成交数据一目了然。", "The latest GTA market data and trends: prices and sales at a glance.")}</p>
              <span className="hp-service-links">
                <a href={DETACHED_REPORT_URL} {...ext} className="hp-link-arrow">{t("独立屋市场", "Detached homes")} <i className="fa-solid fa-arrow-right" /></a>
                <a href={CONDO_REPORT_URL} {...ext} className="hp-link-arrow">{t("公寓市场", "Condos")} <i className="fa-solid fa-arrow-right" /></a>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Search band ──────────────────────────────────────────────── */}
      <section className="hp-band">
        <div className="hp-inner hp-band-inner">
          <div>
            <p className="hp-eyebrow">{t("房源搜索", "Property Search")}</p>
            <h2 className="hp-band-title">{t("在地图上找到您的下一个家", "Find your next home on the map")}</h2>
            <div className="hp-chips">
              <Link to={MAP_URL + "?type=house"} className="hp-chip">{t("独立屋", "Detached")}</Link>
              <Link to={MAP_URL + "?type=condo"} className="hp-chip">{t("公寓", "Condo")}</Link>
              <Link to={MAP_URL + "?type=townhouse"} className="hp-chip">{t("联排", "Townhouse")}</Link>
              <Link to={MAP_URL + "?tx=rent"} className="hp-chip">{t("出租", "For Rent")}</Link>
            </div>
          </div>
          <Link to={MAP_URL} className="hp-btn hp-btn-solid hp-btn-lg">
            {t("打开地图找房", "Open map search")} <i className="fa-solid fa-arrow-right" />
          </Link>
        </div>
      </section>

      {/* ── Why us ───────────────────────────────────────────────────── */}
      <section className="hp-section hp-why">
        <div className="hp-inner hp-why-inner">
          <div className="hp-why-head">
            <p className="hp-eyebrow">{t("为什么选择我们", "Why Us")}</p>
            <h2 className="hp-h2">{t("为什么选择加家团队", "Why Canada Home Team")}</h2>
            <p className="hp-sub">{t("专业实力 · 华语服务 · 本地经验", "Expertise · Bilingual service · Local knowledge")}</p>
          </div>
          <ol className="hp-reasons">
            {reasons.map((r, i) => (
              <li key={r.en} className="hp-reason">
                <span className="hp-reason-no">0{i + 1}</span>
                <div>
                  <h3 className="hp-reason-title">{t(r.zh, r.en)}</h3>
                  <p className="hp-reason-desc">{t(r.dzh, r.den)}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Areas ────────────────────────────────────────────────────── */}
      <section className="hp-section hp-areas-section">
        <div className="hp-inner">
          <SectionHead
            eyebrow={t("服务区域", "Areas")}
            title={t("我们服务的社区", "Where We Work")}
            sub={t("大多伦多全覆盖，深耕万锦与列治文山。", "Across the Greater Toronto Area, with deep roots in Markham and Richmond Hill.")}
          />
          <div className="hp-areas">
            {areas.map((a) => (
              <Link key={a.en} to={MAP_URL} className="hp-area">
                <span className="hp-area-tag">{t(a.tzh, a.ten)}</span>
                <span className="hp-area-name">{t(a.zh, a.en)}</span>
                <span className="hp-area-en">{t(a.en, "")}</span>
                <i className="fa-solid fa-arrow-right hp-area-arrow" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Contact ──────────────────────────────────────────────────── */}
      <section className="hp-contact">
        <div className="hp-inner hp-contact-inner">
          <div>
            <img src={bayLogo} alt="Bay Street Group Inc., Brokerage" className="hp-contact-bay" />
            <h2 className="hp-contact-title">{t("随时开始您的找房之旅", "Start your home search today")}</h2>
            <p className="hp-contact-sub">
              {t("扫描微信二维码，或直接来电，我们将在 24 小时内与您联系。", "Scan our WeChat QR code or call us, and we will get back to you within 24 hours.")}
            </p>
            <ul className="hp-contact-list">
              <li><i className="fa-solid fa-phone" /><a href="tel:6475426760">647-542-6760</a></li>
              <li><i className="fa-solid fa-fax" />905-909-0202 (Fax)</li>
              <li><i className="fa-solid fa-envelope" /><a href="mailto:CanadaHome.realtor@gmail.com">CanadaHome.realtor@gmail.com</a></li>
              <li><i className="fa-solid fa-location-dot" />8300 Woodbine Ave, Suite 500, Markham, ON L3R 9Y7</li>
            </ul>
            <a href={CALENDLY_URL} {...ext} className="hp-btn hp-btn-solid">{t("预约咨询", "Book a consultation")}</a>
          </div>
          <figure className="hp-contact-qr">
            <img src={wechatQr} alt={t("微信二维码", "WeChat QR code")} />
            <figcaption>{t("微信扫码添加好友", "Scan to add us on WeChat")}</figcaption>
          </figure>
        </div>
      </section>
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────────────────────────── */

function SectionHead({ eyebrow, title, sub }) {
  return (
    <div className="hp-head">
      <p className="hp-eyebrow">{eyebrow}</p>
      <h2 className="hp-h2">{title}</h2>
      {sub && <p className="hp-sub">{sub}</p>}
    </div>
  );
}

function Agent({ photo, name, phone, wechatQr, wechatUrl }) {
  const t = useT();
  return (
    <div className="hp-agent">
      <img src={photo} alt={name} className="hp-agent-photo" />
      <div className="hp-agent-body">
        <h3 className="hp-agent-name">{name}</h3>
        <p className="hp-agent-role">Sales Representative</p>
        <a href={`tel:${phone.replace(/\D/g, "")}`} className="hp-agent-phone">{phone}</a>
      </div>
      <a href={wechatUrl} {...ext} className="hp-agent-wechat" title={t("微信扫码添加", "Scan to add on WeChat")}>
        <img src={wechatQr} alt={`${name} WeChat`} />
        <span>{t("微信", "WeChat")}</span>
      </a>
    </div>
  );
}
