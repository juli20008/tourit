import React from "react";
import "../../css/home.css";
import "../../css/pricing.css";

const CALENDLY_URL = "https://calendly.com/julie-li-realtor/";
const DEADLINE = "11月30日前签约有效 · 名额有限";

const SELL_TIERS = [
  {
    no: "①", title: "房屋上市服务", desc: "房源上架 MLS® / Realtor.ca",
    was: "$1,500", now: "$699",
  },
  {
    no: "②", title: "卖房全服务", desc: "上市 + 预约看房 + Offer Presentation + 谈价",
    was: "1.5%", now: "1%",
  },
  {
    no: "③", title: "全方位卖房 + 策略", desc: "全服务内容，再加：",
    was: "2.5%", now: "2%", featured: "最推荐",
    perks: [
      "上市准备建议", "CMA 市场分析", "定价策略", "营销策略与执行",
      "Showing 定期跟进催单", "四次 Open House + 跟踪", "全程「高价快速」策略定位与实施",
    ],
  },
];

const BUY_TIERS = [
  { when: "30 天内成交", example: "$100万房屋 回赠 $10,000", rebate: "1%", featured: "最高回赠" },
  { when: "31–90 天成交", example: "$100万房屋 回赠 $5,000", rebate: "0.5%" },
  { when: "91–180 天成交", example: "固定现金回赠", rebate: "$1,000" },
];

const LEASE_PERKS = [
  "租金收取与催缴提醒", "维修报修协调", "租客日常沟通",
  "入住及退房验房", "续约与租约管理", "租务记录与定期汇报",
];

export default function Pricing() {
  return (
    <div className="hp pr" translate="no">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <section className="pr-hero">
        <div className="hp-inner">
          <p className="pr-kicker" translate="no">加家团队 · CANADA HOME TEAM</p>
          <h1 className="pr-title">服务定价</h1>
          <p className="pr-sub">11月限时优惠 · 卖房、买房、出租，透明收费</p>
          <span className="pr-deadline">{DEADLINE}</span>
          <nav className="pr-jump">
            <a href="#sell">🔑 卖房</a>
            <a href="#buy">🏠 买房</a>
            <a href="#lease">🏘️ 出租</a>
          </nav>
        </div>
      </section>

      {/* ── Sell ───────────────────────────────────────────────────── */}
      <section className="pr-section" id="sell">
        <div className="hp-inner">
          <SectionTitle
            title="11月卖房限时优惠"
            sub={<>100万的房子，最多立省 <b translate="no">$5,000</b></>}
          />
          <div className="pr-stack">
            {SELL_TIERS.map((t) => (
              <div key={t.no} className={`pr-card${t.featured ? " pr-card-featured" : ""}`}>
                {t.featured && <span className="pr-flag">{t.featured}</span>}
                <div className="pr-card-row">
                  <div className="pr-card-main">
                    <h3 className="pr-card-title"><span className="pr-no">{t.no}</span>{t.title}</h3>
                    <p className="pr-card-desc">{t.desc}</p>
                  </div>
                  <div className="pr-price" translate="no">
                    <span className="pr-was">原价 {t.was}</span>
                    <span className="pr-now">{t.now}</span>
                  </div>
                </div>
                {t.perks && (
                  <ul className="pr-perks">
                    {t.perks.map((p) => <li key={p}>{p}</li>)}
                  </ul>
                )}
              </div>
            ))}
          </div>
          <p className="pr-note">佣金不含买方经纪佣金及 HST · $100万示例按第②③档计算</p>
          <Cta label="预约卖房咨询" />
        </div>
      </section>

      {/* ── Buy ────────────────────────────────────────────────────── */}
      <section className="pr-section pr-alt" id="buy">
        <div className="hp-inner">
          <SectionTitle
            title="11月买房现金回赠"
            sub={<>越早成交，回赠越多 · 最高 <b translate="no">1%</b></>}
            note="签 6 个月买方代理合同 · 看房 + 买房全程中文服务"
          />
          <div className="pr-stack">
            {BUY_TIERS.map((t) => (
              <div key={t.when} className={`pr-card${t.featured ? " pr-card-featured" : ""}`}>
                {t.featured && <span className="pr-flag">{t.featured}</span>}
                <div className="pr-card-row">
                  <div className="pr-card-main">
                    <p className="pr-card-eyebrow">签约后</p>
                    <h3 className="pr-card-title">{t.when}</h3>
                    <p className="pr-card-desc" translate="no">{t.example}</p>
                  </div>
                  <div className="pr-price">
                    <span className="pr-was pr-label">回赠</span>
                    <span className="pr-now" translate="no">{t.rebate}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="pr-note">
            成交时间以签约日至 Firm Offer 之日计算。回赠于成交后由经纪公司支付，请告知您的贷款机构。
          </p>
          <Cta label="预约买房咨询" />
        </div>
      </section>

      {/* ── Lease ──────────────────────────────────────────────────── */}
      <section className="pr-section" id="lease">
        <div className="hp-inner">
          <SectionTitle title="11月房东出租服务" sub="委托我们出租，继续赠送" />
          <div className="pr-stack">
            <div className="pr-card pr-card-featured pr-lease">
              <span className="pr-flag">房东专享</span>
              <div className="pr-lease-big">
                <span className="pr-lease-num" translate="no">1</span>
                <span className="pr-lease-unit">年</span>
              </div>
              <h3 className="pr-lease-title">免费租客管理</h3>
              <p className="pr-card-desc">出租成交后，租期内首年管理费全免</p>
            </div>
            <div className="pr-card">
              <h3 className="pr-card-title">租客管理包含</h3>
              <ul className="pr-perks">
                {LEASE_PERKS.map((p) => <li key={p}>{p}</li>)}
              </ul>
            </div>
          </div>
          <Cta label="预约出租咨询" />
        </div>
      </section>

      <section className="pr-footer">
        <div className="hp-inner">
          <p className="pr-deadline-lg">{DEADLINE}</p>
          <p className="pr-brokerage" translate="no">Bay Street Group Inc., Brokerage</p>
        </div>
      </section>
    </div>
  );
}

function SectionTitle({ title, sub, note }) {
  return (
    <div className="pr-head">
      <h2 className="pr-head-title">{title}</h2>
      <p className="pr-head-sub">{sub}</p>
      {note && <p className="pr-head-note">{note}</p>}
    </div>
  );
}

function Cta({ label }) {
  return (
    <div className="pr-cta">
      <a href={CALENDLY_URL} target="_blank" rel="noopener noreferrer" className="hp-btn hp-btn-gold">
        📅 {label}
      </a>
    </div>
  );
}
