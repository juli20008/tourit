import React, { useEffect } from "react";
import setSeo from "../../utils/seo";
import { useT } from "../../utils/lang";
import "../../css/home.css";
import "../../css/pricing.css";

const CALENDLY_URL = "https://calendly.com/julie-li-realtor/";

// Bilingual content: [中文, English]
const DEADLINE = ["11月30日前签约有效 · 名额有限", "Sign by November 30 · Limited spots"];

const SELL_TIERS = [
  {
    no: "①", title: ["房屋上市服务", "Listing Service"], desc: ["房源上架 MLS® / Realtor.ca", "Your home listed on MLS® / Realtor.ca"],
    was: "$1,500", now: "$699",
  },
  {
    no: "②", title: ["卖房全服务", "Full-Service Selling"],
    desc: ["上市 + 预约看房 + Offer Presentation + 谈价", "Listing + showing bookings + offer presentation + negotiation"],
    was: "1.5%", now: "1%",
  },
  {
    no: "③", title: ["全方位卖房 + 策略", "Full Service + Strategy"], desc: ["全服务内容，再加：", "Everything in full service, plus:"],
    was: "2.5%", now: "2%", featured: ["最推荐", "Recommended"],
    perks: [
      ["上市准备建议", "Pre-listing preparation advice"],
      ["CMA 市场分析", "CMA market analysis"],
      ["定价策略", "Pricing strategy"],
      ["营销策略与执行", "Marketing strategy & execution"],
      ["Showing 定期跟进催单", "Regular showing follow-ups"],
      ["四次 Open House + 跟踪", "Four open houses + follow-up"],
      ["全程「高价快速」策略定位与实施", "A sell-high, sell-fast strategy from start to finish"],
    ],
  },
];

const BUY_TIERS = [
  { when: ["30 天内成交", "Firm within 30 days"], example: ["$100万房屋 回赠 $10,000", "$1M home → $10,000 back"], rebate: "1%", featured: ["最高回赠", "Highest rebate"] },
  { when: ["31–90 天成交", "Firm in 31–90 days"], example: ["$100万房屋 回赠 $5,000", "$1M home → $5,000 back"], rebate: "0.5%" },
  { when: ["91–180 天成交", "Firm in 91–180 days"], example: ["固定现金回赠", "Fixed cash rebate"], rebate: "$1,000" },
];

const LEASE_PERKS = [
  ["租金收取与催缴提醒", "Rent collection & reminders"],
  ["维修报修协调", "Repair & maintenance coordination"],
  ["租客日常沟通", "Day-to-day tenant communication"],
  ["入住及退房验房", "Move-in & move-out inspections"],
  ["续约与租约管理", "Renewals & lease management"],
  ["租务记录与定期汇报", "Records & regular reports"],
];

export default function Pricing() {
  const t = useT();
  const tr = (pair) => t(pair[0], pair[1]);

  useEffect(() => {
    setSeo({
      title: "服务定价 · 卖房佣金、买房现金回赠、出租管理",
      description: "加家团队服务定价：卖房上市 $699 起、全服务 1%；买房签约后成交最高回赠 1%；房东出租送 1 年免费租客管理。万锦、列治文山、大多伦多。",
      path: "/pricing",
    });
  }, []);

  return (
    <div className="hp pr" translate="no">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <section className="pr-hero">
        <div className="hp-inner">
          <p className="pr-kicker">加家团队 · CANADA HOME TEAM</p>
          <h1 className="pr-title">{t("服务定价", "Pricing")}</h1>
          <p className="pr-sub">{t("11月限时优惠 · 卖房、买房、出租，透明收费", "November offers · Selling, buying and leasing, with transparent fees")}</p>
          <span className="pr-deadline">{tr(DEADLINE)}</span>
          <nav className="pr-jump">
            <a href="#sell">🔑 {t("卖房", "Sell")}</a>
            <a href="#buy">🏠 {t("买房", "Buy")}</a>
            <a href="#lease">🏘️ {t("出租", "Lease")}</a>
          </nav>
        </div>
      </section>

      {/* ── Sell ───────────────────────────────────────────────────── */}
      <section className="pr-section" id="sell">
        <div className="hp-inner">
          <SectionTitle
            title={t("11月卖房限时优惠", "November Seller Offer")}
            sub={t(<>100万的房子，最多立省 <b>$5,000</b></>, <>Save up to <b>$5,000</b> on a $1M home</>)}
          />
          <div className="pr-stack">
            {SELL_TIERS.map((tier) => (
              <div key={tier.no} className={`pr-card${tier.featured ? " pr-card-featured" : ""}`}>
                {tier.featured && <span className="pr-flag">{tr(tier.featured)}</span>}
                <div className="pr-card-row">
                  <div className="pr-card-main">
                    <h3 className="pr-card-title"><span className="pr-no">{tier.no}</span>{tr(tier.title)}</h3>
                    <p className="pr-card-desc">{tr(tier.desc)}</p>
                  </div>
                  <div className="pr-price">
                    <span className="pr-was">{t("原价", "Was")} {tier.was}</span>
                    <span className="pr-now">{tier.now}</span>
                  </div>
                </div>
                {tier.perks && (
                  <ul className="pr-perks">
                    {tier.perks.map((p) => <li key={p[0]}>{tr(p)}</li>)}
                  </ul>
                )}
              </div>
            ))}
          </div>
          <p className="pr-note">
            {t("佣金不含买方经纪佣金及 HST · $100万示例按第②③档计算",
               "Commission excludes the buyer agent's commission and HST · $1M example based on tiers ② and ③")}
          </p>
          <Cta label={t("预约卖房咨询", "Book a seller consultation")} />
        </div>
      </section>

      {/* ── Buy ────────────────────────────────────────────────────── */}
      <section className="pr-section pr-alt" id="buy">
        <div className="hp-inner">
          <SectionTitle
            title={t("11月买房现金回赠", "November Buyer Cash Rebate")}
            sub={t(<>越早成交，回赠越多 · 最高 <b>1%</b></>, <>The sooner you buy, the bigger the rebate · Up to <b>1%</b></>)}
            note={t("签 6 个月买方代理合同 · 看房 + 买房全程中文服务",
                    "Sign a 6-month buyer representation agreement · Showings and purchase support in Mandarin or English")}
          />
          <div className="pr-stack">
            {BUY_TIERS.map((tier) => (
              <div key={tier.when[0]} className={`pr-card${tier.featured ? " pr-card-featured" : ""}`}>
                {tier.featured && <span className="pr-flag">{tr(tier.featured)}</span>}
                <div className="pr-card-row">
                  <div className="pr-card-main">
                    <p className="pr-card-eyebrow">{t("签约后", "After signing")}</p>
                    <h3 className="pr-card-title">{tr(tier.when)}</h3>
                    <p className="pr-card-desc">{tr(tier.example)}</p>
                  </div>
                  <div className="pr-price">
                    <span className="pr-was pr-label">{t("回赠", "Rebate")}</span>
                    <span className="pr-now">{tier.rebate}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="pr-note">
            {t("成交时间以签约日至 Firm Offer 之日计算。回赠于成交后由经纪公司支付，请告知您的贷款机构。",
               "Timing is measured from the signing date to the date the offer becomes firm. The rebate is paid by the brokerage after closing; please let your lender know.")}
          </p>
          <Cta label={t("预约买房咨询", "Book a buyer consultation")} />
        </div>
      </section>

      {/* ── Lease ──────────────────────────────────────────────────── */}
      <section className="pr-section" id="lease">
        <div className="hp-inner">
          <SectionTitle title={t("11月房东出租服务", "November Landlord Offer")} sub={t("委托我们出租，继续赠送", "List your rental with us and get")} />
          <div className="pr-stack">
            <div className="pr-card pr-card-featured pr-lease">
              <span className="pr-flag">{t("房东专享", "For landlords")}</span>
              <div className="pr-lease-big">
                <span className="pr-lease-num">1</span>
                <span className="pr-lease-unit">{t("年", "year")}</span>
              </div>
              <h3 className="pr-lease-title">{t("免费租客管理", "Free Tenant Management")}</h3>
              <p className="pr-card-desc">{t("出租成交后，租期内首年管理费全免", "Once leased, the first year of management fees is waived")}</p>
            </div>
            <div className="pr-card">
              <h3 className="pr-card-title">{t("租客管理包含", "Tenant management includes")}</h3>
              <ul className="pr-perks">
                {LEASE_PERKS.map((p) => <li key={p[0]}>{tr(p)}</li>)}
              </ul>
            </div>
          </div>
          <Cta label={t("预约出租咨询", "Book a leasing consultation")} />
        </div>
      </section>

      <section className="pr-footer">
        <div className="hp-inner">
          <p className="pr-deadline-lg">{tr(DEADLINE)}</p>
          <p className="pr-brokerage">Bay Street Group Inc., Brokerage</p>
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
