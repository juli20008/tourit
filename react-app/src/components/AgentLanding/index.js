import { useState, useRef, useEffect } from "react";

// ─── Video sources ────────────────────────────────────────────────────────────
const VIDEOS = {
  feature1: "/videos/feature1.mp4",
  feature2: null,
  feature3: null,
};

const CALENDLY_URL = "https://calendly.com/julie-li-realtor/";

// ─── useMobile hook ───────────────────────────────────────────────────────────
const useMobile = () => {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return mobile;
};

// ─── Video slots ──────────────────────────────────────────────────────────────

const isLocalVideo = (src) => src && /\.(mp4|webm|mov)(\?|$)/i.test(src);

const VideoSlot = ({ src, label }) => {
  if (src && !isLocalVideo(src)) {
    return (
      <div style={{ position: "relative", paddingBottom: "56.25%", height: 0, borderRadius: 16, overflow: "hidden", boxShadow: "0 16px 48px rgba(0,0,0,.12)" }}>
        <iframe src={src} title={label} frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
      </div>
    );
  }
  return (
    <div style={{ aspectRatio: "16/9", background: "linear-gradient(135deg,#1e293b,#0f172a)", borderRadius: 16, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", boxShadow: "0 16px 48px rgba(0,0,0,.12)" }}>
      <div style={S.playBtn}>▶</div>
      <div style={{ color: "#94a3b8", fontSize: "0.8rem", marginTop: 10 }}>{label}</div>
    </div>
  );
};

const VerticalVideoSlot = ({ src, label, frameWidth }) => {
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const toggle = () => {
    const v = videoRef.current;
    if (!v) return;
    v.paused ? v.play() : v.pause();
  };
  if (!src) {
    return (
      <div style={{ width: frameWidth, aspectRatio: "9/19.5", background: "linear-gradient(135deg,#1e293b,#0f172a)", borderRadius: 32, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", boxShadow: "0 0 0 7px #1e293b, 0 20px 48px rgba(0,0,0,.2)" }}>
        <div style={S.bigPlayBtn}>▶</div>
        <div style={{ color: "#94a3b8", fontSize: "0.8rem", marginTop: 10 }}>{label}</div>
      </div>
    );
  }
  return (
    <div style={{ width: frameWidth, background: "#0f172a", borderRadius: 32, boxShadow: "0 0 0 7px #1e293b, 0 24px 60px rgba(0,0,0,.35)", overflow: "hidden" }}>
      <div style={{ height: 24, background: "#0f172a" }} />
      <div style={{ position: "relative" }}>
        <video ref={videoRef} src={src} playsInline
          onEnded={() => setPlaying(false)}
          onPause={() => setPlaying(false)}
          onPlay={() => setPlaying(true)}
          style={{ width: "100%", display: "block", borderRadius: "0 0 26px 26px" }} />
        <div onClick={toggle} style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", borderRadius: "0 0 26px 26px", background: playing ? "transparent" : "rgba(0,0,0,.28)", transition: "background .2s" }}>
          {!playing && <div style={S.bigPlayBtn}>▶</div>}
        </div>
      </div>
    </div>
  );
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const Check = () => (
  <span style={{ color: "#16a34a", fontWeight: 700, marginRight: 8, flexShrink: 0 }}>✓</span>
);

// ─── Pricing cards ────────────────────────────────────────────────────────────

const PricingCard1 = () => (
  <div style={S.priceCard}>
    <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", marginBottom: 8 }}>
      <span style={S.priceFree}>免费</span>
      <span style={{ color: "#94a3b8", fontSize: "0.85rem", marginLeft: 8 }}>FREE</span>
      <span style={{ fontSize: "0.82rem", color: "#94a3b8", textDecoration: "line-through", marginLeft: "auto", alignSelf: "center" }}>原价 $400 / 年</span>
    </div>
    <div style={S.priceDivider} />
    <div style={{ display: "flex", alignItems: "flex-start" }}>
      <span style={{ fontSize: "1.1rem", marginRight: 10, flexShrink: 0 }}>🔥</span>
      <div>
        <div style={S.priceCondition}>前 100 名注册经纪人免费用一年</div>
        <div style={S.priceConditionEn}>First 100 agents — free for 1 year · No credit card</div>
      </div>
    </div>
    <div style={{ display: "flex", alignItems: "center", marginTop: 8 }}>
      <span style={{ fontSize: "1.1rem", marginRight: 8 }}>⏳</span>
      <div style={{ color: "#f59e0b", fontSize: "0.82rem", fontWeight: 600 }}>名额有限，送完为止 · Limited spots</div>
    </div>
  </div>
);

const PricingCard2 = () => (
  <div style={S.priceCard}>
    <div style={{ marginBottom: 14 }}>
      <div style={S.priceLabel}>声音克隆上传 · Voice profile upload</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 4 }}>
        <span style={S.priceAmount}>$5</span>
        <span style={{ fontSize: "0.82rem", color: "#64748b" }}>/ 次 per upload</span>
      </div>
      <div style={{ color: "#94a3b8", fontSize: "0.78rem", marginTop: 2 }}>一次上传，永久复用 · Upload once, use forever</div>
    </div>
    <div style={S.priceDivider} />
    <div>
      <div style={S.priceLabel}>视频生成 · Video generation</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 4 }}>
        <span style={S.priceAmount}>$3</span>
        <span style={{ fontSize: "0.82rem", color: "#64748b" }}>/ 条 per video</span>
      </div>
      <div style={{ color: "#94a3b8", fontSize: "0.78rem", marginTop: 2 }}>每套房子单独生成 · Bulk pricing available</div>
    </div>
  </div>
);

const PricingCard3 = () => (
  <div style={S.priceCard}>
    <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", marginBottom: 8 }}>
      <span style={S.priceFree}>免费获客</span>
      <span style={{ color: "#94a3b8", fontSize: "0.85rem", marginLeft: 8 }}>Free leads</span>
    </div>
    <div style={S.priceDivider} />
    <div style={{ display: "flex", alignItems: "flex-start" }}>
      <span style={{ fontSize: "1.2rem", marginRight: 10, flexShrink: 0 }}>🤝</span>
      <div>
        <div style={S.priceCondition}>成交后支付 30% 佣金分润</div>
        <div style={S.priceConditionEn}>Pay 30% commission — only when you close</div>
      </div>
    </div>
    <div style={{ display: "flex", alignItems: "center", marginTop: 8, background: "rgba(22,163,74,.07)", borderRadius: 8, padding: "8px 10px" }}>
      <span style={{ fontSize: "1rem", marginRight: 8 }}>✅</span>
      <div style={{ color: "#15803d", fontSize: "0.82rem", fontWeight: 600 }}>不成交不付钱 · Zero risk — no close, no fee</div>
    </div>
  </div>
);

// ─── Feature data ─────────────────────────────────────────────────────────────

const FEATURES = [
  {
    n: 1,
    tag: "白标网站 · White-label Site",
    zh: "免费经纪人白标网站",
    en: "Your brand. Your domain. Your listings.",
    desc: "每位经纪人拥有专属子域名主页，房源、视频、预约全部集成。一个链接发出去，客户全程留在你的品牌下。",
    descEn: "Every agent gets a branded subdomain — listings, videos, and bookings all in one place.",
    bullets: [
      "免费开通，无需技术背景 / Free setup, no tech skills needed",
      "房源自动同步 MLS，实时更新 / Listings auto-sync from MLS",
      "微信、小红书、朋友圈一键分享 / One-tap share to WeChat & XHS",
      "移动端完美适配 / Fully mobile-optimized",
    ],
    Price: PricingCard1,
    videoKey: "feature1",
    videoLabel: "白标网站演示 Demo",
    vertical: true,
    flip: false,
    bg: "#ffffff",
  },
  {
    n: 2,
    tag: "AI 视频 · AI Property Video",
    zh: "一键生成看房自媒体视频",
    en: "Real face · AI voice clone · Auto-subtitled",
    desc: "录制真人出镜开场，AI 克隆你的声音生成专业旁白，自动剪辑房源照片、配字幕、加背景音乐。直接下载发抖音、小红书、微信视频号。",
    descEn: "Record a selfie intro. AI clones your voice, writes the script, assembles photos, adds captions — download and post instantly.",
    bullets: [
      "真人出镜 + 声音克隆，专业感拉满 / Real face intro + voice clone",
      "AI 自动撰写口播文案 / AI-written narration script",
      "竖屏 9:16，直接适配各平台 / 9:16 vertical, platform-ready",
      "每套房子 < 5 分钟生成 / Under 5 min per listing",
    ],
    Price: PricingCard2,
    videoKey: "feature2",
    videoLabel: "视频生成演示 Demo",
    vertical: false,
    flip: true,
    bg: "#f8fafc",
  },
  {
    n: 3,
    tag: "Lead 分发 · Lead Distribution",
    zh: "免费获客，成交再付",
    en: "Get leads for free. Pay only when you close.",
    desc: "Tourit 将有意向的买家 Lead 直接分发给你。客户无需登录、无需留联系方式，通过内置聊天自然建立信任，成交后才支付 30% 佣金分润。",
    descEn: "Tourit distributes ready buyers directly to you. Clients book with zero friction. Pay 30% commission only on closed deals.",
    bullets: [
      "0 元获取 Lead，无订阅费 / Zero upfront cost to receive leads",
      "客户直约，内置实时聊天 / Direct booking with built-in live chat",
      "成交前零摩擦，转化率极高 / Zero friction before close",
      "预约、聊天记录全程存档 / Full appointment & chat history",
    ],
    Price: PricingCard3,
    videoKey: "feature3",
    videoLabel: "客户预约演示 Demo",
    vertical: false,
    flip: false,
    bg: "#ffffff",
  },
];

// ─── Pricing table ────────────────────────────────────────────────────────────

const PricingTable = () => {
  const isMobile = useMobile();
  return (
    <section style={{ background: "#f8fafc", padding: isMobile ? "56px 20px" : "88px 24px", borderTop: "1px solid #e2e8f0" }}>
      <div style={{ maxWidth: 1060, margin: "0 auto", textAlign: "center" }}>
        <p style={S.pricingEyebrow}>透明定价 · Clear Pricing</p>
        <h2 style={{ ...S.pricingTitle, fontSize: isMobile ? "1.7rem" : "clamp(1.8rem,4vw,2.6rem)", marginBottom: isMobile ? 32 : 48 }}>
          三大工具，一目了然
          <span style={{ display: "block", fontSize: isMobile ? "1rem" : "1.3rem", fontWeight: 500, color: "#64748b", marginTop: 8 }}>
            Straightforward pricing, no surprises
          </span>
        </h2>

        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)",
          gap: isMobile ? 16 : 24,
          textAlign: "left",
          maxWidth: isMobile ? 400 : "none",
          margin: "0 auto",
        }}>
          {/* Col 1 */}
          <div style={{ ...S.pricingCol, borderTop: "3px solid #6366f1" }}>
            <div style={{ fontSize: "1.6rem", marginBottom: 10 }}>🌐</div>
            <div style={S.pricingColTitle}>白标网站</div>
            <div style={S.pricingColSub}>White-label Site</div>
            <div style={{ fontSize: "2.4rem", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1 }}>
              <span style={{ textDecoration: "line-through", color: "#94a3b8", fontSize: "1.1rem", fontWeight: 400, marginRight: 6 }}>$400</span>
              <span style={{ color: "#16a34a" }}>免费</span>
            </div>
            <div style={S.pricingBigNumSub}>前 100 名免费用一年 · $400/yr thereafter</div>
            <div style={S.pricingColDivider} />
            {["专属子域名主页", "MLS 自动同步", "一键社媒分享", "移动端适配"].map((t, i) => (
              <div key={i} style={S.pricingFeatureRow}><Check />{t}</div>
            ))}
            <div style={{ marginTop: "auto", paddingTop: 20 }}>
              <a href="#cta" style={S.pricingCTA}>前 100 名免费注册 →</a>
            </div>
          </div>

          {/* Col 2 */}
          <div style={{ ...S.pricingCol, borderTop: "3px solid #f59e0b", position: "relative" }}>
            <div style={{ position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)", background: "#f59e0b", color: "#fff", borderRadius: 20, padding: "3px 14px", fontSize: "0.75rem", fontWeight: 700, whiteSpace: "nowrap" }}>⭐ 最受欢迎</div>
            <div style={{ fontSize: "1.6rem", marginBottom: 10 }}>🎬</div>
            <div style={S.pricingColTitle}>AI 看房视频</div>
            <div style={S.pricingColSub}>AI Property Video</div>
            <div style={{ marginTop: 12, marginBottom: 4 }}>
              <div style={{ fontSize: "0.78rem", color: "#64748b", marginBottom: 2 }}>声音克隆 Voice upload</div>
              <div style={{ fontSize: "2.4rem", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, color: "#0f172a" }}>$5</div>
              <div style={S.pricingBigNumSub}>/ 次 · 一次终身用</div>
            </div>
            <div style={{ marginTop: 8, marginBottom: 4 }}>
              <div style={{ fontSize: "0.78rem", color: "#64748b", marginBottom: 2 }}>视频生成 Per video</div>
              <div style={{ fontSize: "2.4rem", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, color: "#0f172a" }}>$3</div>
              <div style={S.pricingBigNumSub}>/ 条 · &lt;5 min generation</div>
            </div>
            <div style={S.pricingColDivider} />
            {["真人出镜开场", "AI 声音克隆", "自动字幕 + 背景音乐", "竖屏 9:16 即传即用"].map((t, i) => (
              <div key={i} style={S.pricingFeatureRow}><Check />{t}</div>
            ))}
            <div style={{ marginTop: "auto", paddingTop: 20 }}>
              <a href="#cta" style={{ ...S.pricingCTA, background: "#f59e0b" }}>开始生成视频 →</a>
            </div>
          </div>

          {/* Col 3 */}
          <div style={{ ...S.pricingCol, borderTop: "3px solid #16a34a" }}>
            <div style={{ fontSize: "1.6rem", marginBottom: 10 }}>🤝</div>
            <div style={S.pricingColTitle}>Lead 分发</div>
            <div style={S.pricingColSub}>Lead Distribution</div>
            <div style={{ fontSize: "2.4rem", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, color: "#16a34a" }}>$0</div>
            <div style={S.pricingBigNumSub}>获客免费 · 成交付 30% 佣金</div>
            <div style={S.pricingColDivider} />
            {["0 元接收 Leads", "客户直约，零摩擦", "内置实时聊天", "不成交不付钱"].map((t, i) => (
              <div key={i} style={S.pricingFeatureRow}><Check />{t}</div>
            ))}
            <div style={{ marginTop: "auto", paddingTop: 20 }}>
              <a href="#cta" style={{ ...S.pricingCTA, background: "#16a34a" }}>免费加入网络 →</a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

// ─── CTA section ──────────────────────────────────────────────────────────────

const CTASection = () => {
  const isMobile = useMobile();
  return (
    <section style={{ background: "linear-gradient(160deg,#0a0f1e,#0f172a)", padding: isMobile ? "64px 20px" : "96px 24px", textAlign: "center" }}>
      <div style={{ maxWidth: 620, margin: "0 auto" }}>
        <p style={{ fontSize: "0.85rem", fontWeight: 600, color: "#f59e0b", letterSpacing: "0.06em", marginBottom: 16 }}>🔥 限时优惠 · Limited-Time Offer</p>
        <h2 style={{ fontSize: isMobile ? "1.7rem" : "clamp(1.8rem,4vw,2.6rem)", fontWeight: 800, color: "#f8fafc", lineHeight: 1.2, letterSpacing: "-0.02em", marginBottom: 20 }}>
          前 100 名，白标网站免费用一年
          <span style={{ display: "block", fontSize: isMobile ? "1rem" : "1.3rem", fontWeight: 500, color: "#94a3b8", marginTop: 8 }}>
            First 100 agents — white-label site free for 1 year
          </span>
        </h2>

        <div style={{ display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap", marginBottom: 28 }}>
          {[
            { label: "白标网站", value: "$400/yr → 免费", color: "#a78bfa" },
            { label: "每条视频", value: "$3 / video", color: "#60a5fa" },
            { label: "获客成本", value: "$0 upfront", color: "#34d399" },
          ].map((v, i) => (
            <div key={i} style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 10, padding: "10px 16px", textAlign: "center", minWidth: isMobile ? 90 : 110 }}>
              <div style={{ color: v.color, fontWeight: 700, fontSize: isMobile ? "0.9rem" : "1rem" }}>{v.value}</div>
              <div style={{ color: "#475569", fontSize: "0.72rem", marginTop: 2 }}>{v.label}</div>
            </div>
          ))}
        </div>

        <p style={{ color: "#64748b", fontSize: isMobile ? "0.88rem" : "0.92rem", marginBottom: 32, maxWidth: 460, margin: "0 auto 32px" }}>
          与 Julie 预约 15 分钟演示，当场开通您的免费白标网站账号。<br />
          <span style={{ fontSize: "0.82rem" }}>Book a 15-min demo with Julie — we'll set up your free account on the call.</span>
        </p>

        <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 12, justifyContent: "center", alignItems: "stretch", maxWidth: isMobile ? 340 : "none", margin: "0 auto" }}>
          <a href={CALENDLY_URL} target="_blank" rel="noopener noreferrer"
            style={{ display: "block", textAlign: "center", background: "linear-gradient(135deg,#3b82f6,#6366f1)", color: "#fff", borderRadius: 12, padding: "15px 28px", fontWeight: 700, fontSize: "1rem", textDecoration: "none", boxShadow: "0 4px 20px rgba(99,102,241,.4)" }}>
            📅 与 Julie 预约 Demo
          </a>
          <a href={CALENDLY_URL} target="_blank" rel="noopener noreferrer"
            style={{ display: "block", textAlign: "center", background: "rgba(255,255,255,.08)", border: "1.5px solid rgba(255,255,255,.18)", color: "#f8fafc", borderRadius: 12, padding: "15px 28px", fontWeight: 700, fontSize: "1rem", textDecoration: "none" }}>
            🌐 领取免费白标网站
          </a>
        </div>

        <p style={{ color: "#334155", fontSize: "0.75rem", marginTop: 20 }}>
          名额有限，送完为止 · Limited spots &nbsp;·&nbsp; 无需信用卡 · No credit card
        </p>
      </div>
    </section>
  );
};

// ─── Main page ────────────────────────────────────────────────────────────────

const AgentLanding = () => {
  const isMobile = useMobile();

  return (
    <div style={{ background: "#fff", minHeight: "100vh", overflowX: "hidden" }}>

      {/* ── Hero ── */}
      <section style={{ background: "linear-gradient(160deg,#0a0f1e 0%,#0f172a 60%,#1e1b4b 100%)", color: "#fff", padding: isMobile ? "56px 20px 48px" : "96px 24px 80px", position: "relative", overflow: "hidden", textAlign: "center" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", position: "relative", zIndex: 1 }}>

          <div style={{ display: "inline-block", background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 20, padding: "5px 14px", fontSize: isMobile ? "0.72rem" : "0.8rem", color: "#94a3b8", marginBottom: 24 }}>
            专为华人经纪人打造 · Built for Chinese-Canadian Realtors
          </div>

          <h1 style={{ fontSize: isMobile ? "2rem" : "clamp(2.2rem,6vw,3.8rem)", fontWeight: 800, lineHeight: 1.15, color: "#f8fafc", margin: "0 0 16px", letterSpacing: "-0.02em" }}>
            让每一位经纪人<br />都拥有自己的<br />
            <span style={{ background: "linear-gradient(135deg,#60a5fa,#a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
              数字营销武器库
            </span>
          </h1>

          <p style={{ color: "#94a3b8", fontSize: isMobile ? "0.95rem" : "1.1rem", lineHeight: 1.7, marginBottom: 28 }}>
            白标网站 · AI 视频 · Lead 分发<br />
            <span style={{ color: "#64748b" }}>White-label site · AI video · Lead distribution</span>
          </p>

          {/* Pricing pills */}
          <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "center", alignItems: isMobile ? "stretch" : "center", gap: 10, flexWrap: "wrap", marginBottom: 32, maxWidth: isMobile ? 320 : "none", margin: isMobile ? "0 auto 32px" : "0 0 32px" }}>
            {[
              { icon: "🌐", zh: "白标网站", price: "原价 $400/yr", highlight: "前100名免费1年" },
              { icon: "🎬", zh: "AI 看房视频", price: "$5 声音克隆", highlight: "$3 / 条" },
              { icon: "🤝", zh: "Lead 分发", price: "获客 $0", highlight: "成交付 30%" },
            ].map((f, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 14, padding: "10px 16px", textAlign: "left" }}>
                <span style={{ fontSize: "1.4rem", flexShrink: 0 }}>{f.icon}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "#f8fafc" }}>{f.zh}</div>
                  <div style={{ fontSize: "0.7rem", color: "#64748b", textDecoration: "line-through" }}>{f.price}</div>
                  <div style={{ fontSize: "0.78rem", color: "#34d399", fontWeight: 600 }}>{f.highlight}</div>
                </div>
              </div>
            ))}
          </div>

          <a href="#cta" style={{ display: "inline-block", background: "linear-gradient(135deg,#3b82f6,#6366f1)", color: "#fff", borderRadius: 12, padding: isMobile ? "14px 28px" : "14px 32px", fontWeight: 700, fontSize: isMobile ? "0.95rem" : "1rem", textDecoration: "none", boxShadow: "0 4px 20px rgba(99,102,241,.4)" }}>
            🔥 前 100 名免费注册 · Claim your spot →
          </a>
          <div style={{ color: "#475569", fontSize: "0.78rem", marginTop: 10 }}>
            名额有限，送完为止 · Limited spots available
          </div>
        </div>
      </section>

      {/* ── Three features ── */}
      {FEATURES.map((f) => {
        const Price = f.Price;
        const videoSrc = VIDEOS[f.videoKey];
        // On mobile: always column (text → video). On desktop: respect flip.
        const direction = isMobile ? "column" : (f.flip ? "row-reverse" : "row");
        const frameWidth = isMobile ? Math.min(220, window.innerWidth - 80) : 260;

        return (
          <section key={f.n} style={{ padding: isMobile ? "48px 20px" : "80px 24px", borderBottom: "1px solid #f1f5f9", background: f.bg }}>
            <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: direction, alignItems: f.vertical && !isMobile ? "center" : "flex-start", gap: isMobile ? 32 : 64, flexWrap: "wrap" }}>

              {/* Text */}
              <div style={{ flex: "1 1 300px", maxWidth: isMobile ? "100%" : 520, width: isMobile ? "100%" : "auto" }}>
                <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, borderRadius: "50%", background: "#0f172a", color: "#fff", fontWeight: 800, fontSize: "0.9rem", marginBottom: 14 }}>
                  {String(f.n).padStart(2, "0")}
                </div>
                <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#6366f1", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>{f.tag}</div>
                <h2 style={{ fontSize: isMobile ? "1.6rem" : "clamp(1.7rem,3.5vw,2.4rem)", fontWeight: 800, color: "#0f172a", lineHeight: 1.2, letterSpacing: "-0.02em", marginBottom: 8 }}>{f.zh}</h2>
                <p style={{ fontSize: "0.95rem", fontWeight: 500, color: "#64748b", marginBottom: 12, fontStyle: "italic" }}>{f.en}</p>
                <p style={{ fontSize: "0.92rem", color: "#334155", lineHeight: 1.75, marginBottom: 6 }}>{f.desc}</p>
                <p style={{ fontSize: "0.82rem", color: "#94a3b8", lineHeight: 1.65, marginBottom: 16 }}>{f.descEn}</p>
                <ul style={{ listStyle: "none", margin: "0 0 20px", padding: 0 }}>
                  {f.bullets.map((b, i) => (
                    <li key={i} style={{ fontSize: "0.88rem", color: "#334155", padding: "4px 0", display: "flex", alignItems: "flex-start" }}>
                      <Check />{b}
                    </li>
                  ))}
                </ul>
                <Price />
              </div>

              {/* Video */}
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", width: isMobile ? "100%" : "auto", flex: f.vertical ? "0 0 auto" : "1 1 300px" }}>
                {f.vertical
                  ? <VerticalVideoSlot src={videoSrc} label={f.videoLabel} frameWidth={frameWidth} />
                  : <div style={{ width: "100%" }}><VideoSlot src={videoSrc} label={f.videoLabel} /></div>
                }
              </div>
            </div>
          </section>
        );
      })}

      {/* ── Pricing table ── */}
      <PricingTable />

      {/* ── CTA ── */}
      <div id="cta">
        <CTASection />
      </div>

      <style>{`
        @keyframes al-fade-up {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

// ─── Shared styles (non-responsive) ──────────────────────────────────────────

const S = {
  playBtn: {
    width: 60, height: 60,
    background: "rgba(255,255,255,.1)", border: "2px solid rgba(255,255,255,.2)",
    borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: "1.4rem", color: "rgba(255,255,255,.6)", paddingLeft: 4,
  },
  bigPlayBtn: {
    width: 72, height: 72,
    background: "rgba(255,255,255,.92)", borderRadius: "50%",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: "1.8rem", color: "#0f172a", paddingLeft: 6,
    boxShadow: "0 4px 24px rgba(0,0,0,.35)", flexShrink: 0,
  },
  priceCard: {
    background: "#f8fafc", border: "1.5px solid #e2e8f0",
    borderRadius: 14, padding: "16px 18px", marginTop: 8,
  },
  priceFree: { fontSize: "1.6rem", fontWeight: 800, color: "#16a34a", letterSpacing: "-0.02em" },
  priceDivider: { height: 1, background: "#e2e8f0", margin: "10px 0" },
  priceCondition: { fontWeight: 700, fontSize: "0.9rem", color: "#0f172a" },
  priceConditionEn: { fontSize: "0.78rem", color: "#64748b", marginTop: 2 },
  priceLabel: { fontSize: "0.78rem", fontWeight: 600, color: "#64748b", letterSpacing: "0.04em" },
  priceAmount: { fontSize: "2rem", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.03em", lineHeight: 1 },
  pricingEyebrow: { fontSize: "0.78rem", fontWeight: 600, color: "#6366f1", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 },
  pricingTitle: { fontWeight: 800, color: "#0f172a", lineHeight: 1.2, letterSpacing: "-0.02em" },
  pricingCol: {
    background: "#fff", borderRadius: 16, padding: "28px 22px 22px",
    boxShadow: "0 2px 16px rgba(0,0,0,.06)", display: "flex", flexDirection: "column",
  },
  pricingColTitle: { fontWeight: 800, fontSize: "1.1rem", color: "#0f172a", marginBottom: 2 },
  pricingColSub: { fontSize: "0.78rem", color: "#64748b", marginBottom: 16 },
  pricingBigNumSub: { fontSize: "0.78rem", color: "#64748b", marginBottom: 8, marginTop: 2 },
  pricingColDivider: { height: 1, background: "#f1f5f9", margin: "14px 0" },
  pricingFeatureRow: { display: "flex", alignItems: "center", fontSize: "0.85rem", color: "#334155", padding: "4px 0" },
  pricingCTA: { display: "block", textAlign: "center", background: "#0f172a", color: "#fff", borderRadius: 10, padding: "11px 0", fontWeight: 700, fontSize: "0.88rem", textDecoration: "none" },
};

export default AgentLanding;
