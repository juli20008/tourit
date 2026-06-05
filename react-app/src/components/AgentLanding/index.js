import { useState, useRef } from "react";
import apiFetch from "../../utils/apiFetch";

// ─── Video embed URLs ─────────────────────────────────────────────────────────
// Replace null with your embed URLs (YouTube, Loom, etc.)
// e.g. "https://www.youtube.com/embed/VIDEO_ID"
const VIDEOS = {
  feature1: null,
  feature2: null,
  feature3: null,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VideoSlot = ({ src, label }) => {
  if (src) {
    return (
      <div style={S.videoWrap}>
        <iframe
          src={src}
          title={label}
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        />
      </div>
    );
  }
  return (
    <div style={S.videoPlaceholder}>
      <div style={S.playBtn}>▶</div>
      <div style={{ color: "#94a3b8", fontSize: "0.8rem", marginTop: 10 }}>{label}</div>
    </div>
  );
};

const Badge = ({ n }) => (
  <div style={S.badge}>{String(n).padStart(2, "0")}</div>
);

const Check = () => (
  <span style={{ color: "#16a34a", fontWeight: 700, marginRight: 8, fontSize: "1rem" }}>✓</span>
);

// ─── Feature sections data ────────────────────────────────────────────────────

const FEATURES = [
  {
    n: 1,
    tag: "白标网站 · White-label Site",
    zh: "免费经纪人白标网站",
    en: "Your brand. Your domain. Your listings.",
    desc: "每位经纪人拥有一个专属子域名主页，房源、视频、预约全部集成。一个链接发出去，客户全程留在你的品牌下。",
    descEn: "Every agent gets a branded subdomain — listings, videos, and bookings all in one place. Share one link and keep clients in your world.",
    bullets: [
      "免费开通，无需技术背景 / Free setup, no tech skills needed",
      "房源自动同步 MLS，实时更新 / Listings auto-sync from MLS",
      "微信、小红书、朋友圈一键分享 / One-tap share to WeChat, XHS, moments",
      "移动端完美适配 / Fully mobile-optimized",
    ],
    videoKey: "feature1",
    videoLabel: "白标网站演示 Demo",
    flip: false,
    bg: "#ffffff",
  },
  {
    n: 2,
    tag: "AI 视频 · AI Property Video",
    zh: "一键生成看房自媒体视频",
    en: "Real face · AI voice clone · Auto-subtitled",
    desc: "录制 10 秒真人出镜开场，AI 克隆你的声音生成专业旁白，自动剪辑房源照片、配字幕、加背景音乐。直接下载发抖音、小红书、微信视频号。",
    descEn: "Record a 10-second selfie intro. AI clones your voice, writes the script, assembles property photos, adds captions and music — download and post instantly.",
    bullets: [
      "真人出镜 + 声音克隆，专业感拉满 / Real face intro + voice clone",
      "AI 自动撰写口播文案 / AI-written narration script",
      "竖屏 9:16，直接适配各平台 / 9:16 vertical, platform-ready",
      "每套房子 < 5 分钟生成 / Under 5 min per listing",
    ],
    videoKey: "feature2",
    videoLabel: "视频生成演示 Demo",
    flip: true,
    bg: "#f8fafc",
  },
  {
    n: 3,
    tag: "零摩擦预约 · Frictionless Booking",
    zh: "客户直约，无需登录",
    en: "The smoothest showing flow in the industry.",
    desc: "客户看到房源，直接选时间预约，不需要注册账号、不需要留联系方式、不需要下载任何 App。实时聊天窗口内置，成交前零信息壁垒。",
    descEn: "Clients pick a time slot directly from your listing — no account, no contact form, no app download. Built-in real-time chat closes the loop seamlessly.",
    bullets: [
      "客户 0 摩擦预约，转化率大幅提升 / Zero-friction booking, higher conversion",
      "经纪人实时收邮件通知 / Instant email notification to agent",
      "内置实时聊天，引导留资 / Built-in live chat for natural lead capture",
      "预约记录、聊天记录全部存档 / Full appointment & chat history",
    ],
    videoKey: "feature3",
    videoLabel: "预约流程演示 Demo",
    flip: false,
    bg: "#ffffff",
  },
];

// ─── Email CTA ────────────────────────────────────────────────────────────────

const CTASection = () => {
  const [email, setEmail]       = useState("");
  const [state, setState]       = useState("idle"); // idle | loading | done | error
  const [errMsg, setErrMsg]     = useState("");
  const inputRef                = useRef(null);

  const submit = async (e) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setErrMsg("请输入有效的邮箱地址 / Please enter a valid email");
      inputRef.current?.focus();
      return;
    }
    setErrMsg("");
    setState("loading");
    try {
      const res = await apiFetch("/api/agent-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      if (res.ok) {
        setState("done");
      } else {
        const d = await res.json().catch(() => ({}));
        setErrMsg(d.error || "提交失败，请稍后再试 / Submission failed, try again");
        setState("error");
      }
    } catch {
      setErrMsg("网络错误，请稍后再试 / Network error, please try again");
      setState("error");
    }
  };

  return (
    <section style={S.ctaSection}>
      <div style={S.ctaInner}>
        {state === "done" ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "3rem", marginBottom: 16 }}>🎉</div>
            <h2 style={{ ...S.ctaTitle, marginBottom: 12 }}>收到了！</h2>
            <p style={{ color: "#94a3b8", fontSize: "1.05rem", maxWidth: 460, margin: "0 auto" }}>
              我们会在 24 小时内联系您，帮您开通专属账号。<br />
              <span style={{ color: "#64748b" }}>We'll reach out within 24 hours to set up your free account.</span>
            </p>
          </div>
        ) : (
          <>
            <p style={S.ctaEyebrow}>限时免费 · Free While in Beta</p>
            <h2 style={S.ctaTitle}>
              现在注册，永久免费
              <span style={{ display: "block", fontSize: "1.6rem", fontWeight: 500, color: "#94a3b8", marginTop: 8 }}>
                Register now — free forever for early members
              </span>
            </h2>
            <p style={{ color: "#64748b", fontSize: "1rem", marginBottom: 32, maxWidth: 500, margin: "0 auto 32px" }}>
              填入您的邮箱，我们会在 24 小时内为您开通账号并安排演示。<br />
              <span style={{ fontSize: "0.9rem" }}>Drop your email — we'll set up your account and schedule a demo within 24 hours.</span>
            </p>
            <form onSubmit={submit} style={S.ctaForm}>
              <input
                ref={inputRef}
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setErrMsg(""); }}
                placeholder="your@email.com"
                style={S.ctaInput}
                disabled={state === "loading"}
                autoComplete="email"
              />
              <button
                type="submit"
                style={{
                  ...S.ctaBtn,
                  opacity: state === "loading" ? 0.7 : 1,
                  cursor: state === "loading" ? "not-allowed" : "pointer",
                }}
                disabled={state === "loading"}
              >
                {state === "loading" ? "提交中…" : "Claim my free account →"}
              </button>
            </form>
            {errMsg && (
              <p style={{ color: "#f87171", fontSize: "0.85rem", marginTop: 12 }}>{errMsg}</p>
            )}
            <p style={{ color: "#475569", fontSize: "0.8rem", marginTop: 20 }}>
              无需绑定信用卡 · No credit card required &nbsp;·&nbsp; 随时可取消 · Cancel anytime
            </p>
          </>
        )}
      </div>
    </section>
  );
};

// ─── Main page ────────────────────────────────────────────────────────────────

const AgentLanding = () => {
  return (
    <div style={S.page}>

      {/* ── Hero ── */}
      <section style={S.hero}>
        <div style={S.heroInner}>
          <div style={S.heroPill}>专为华人经纪人打造 · Built for Chinese-Canadian Realtors</div>
          <h1 style={S.heroTitle}>
            让每一位经纪人<br />
            都拥有自己的<br />
            <span style={S.heroAccent}>数字营销武器库</span>
          </h1>
          <p style={S.heroSub}>
            白标网站 · AI 视频 · 零摩擦预约<br />
            <span style={{ color: "#64748b" }}>White-label site · AI video · Frictionless booking</span>
          </p>

          {/* Feature pills */}
          <div style={S.heroPills}>
            {[
              { icon: "🌐", zh: "免费白标网站", en: "Free white-label site" },
              { icon: "🎬", zh: "一键看房视频", en: "One-click property video" },
              { icon: "📅", zh: "客户直约", en: "Direct client booking" },
            ].map((f, i) => (
              <div key={i} style={S.heroPillCard}>
                <span style={{ fontSize: "1.6rem" }}>{f.icon}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#f8fafc" }}>{f.zh}</div>
                  <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{f.en}</div>
                </div>
              </div>
            ))}
          </div>

          <a href="#cta" style={S.heroBtn}>
            立即免费注册 · Claim your free account →
          </a>
        </div>

        {/* Decorative gradient orbs */}
        <div style={{ ...S.orb, top: "10%", right: "8%", background: "radial-gradient(circle, rgba(59,130,246,.15) 0%, transparent 70%)", width: 400, height: 400 }} />
        <div style={{ ...S.orb, bottom: "5%", left: "5%", background: "radial-gradient(circle, rgba(139,92,246,.1) 0%, transparent 70%)", width: 300, height: 300 }} />
      </section>

      {/* ── Three features ── */}
      {FEATURES.map((f) => (
        <section key={f.n} style={{ ...S.featureSection, background: f.bg }}>
          <div style={{
            ...S.featureInner,
            flexDirection: f.flip ? "row-reverse" : "row",
          }}>

            {/* Text side */}
            <div style={S.featureText}>
              <Badge n={f.n} />
              <div style={S.featureTag}>{f.tag}</div>
              <h2 style={S.featureTitle}>{f.zh}</h2>
              <p style={S.featureEn}>{f.en}</p>
              <p style={S.featureDesc}>{f.desc}</p>
              <p style={S.featureDescEn}>{f.descEn}</p>
              <ul style={S.bulletList}>
                {f.bullets.map((b, i) => (
                  <li key={i} style={S.bulletItem}>
                    <Check />{b}
                  </li>
                ))}
              </ul>
            </div>

            {/* Video side */}
            <div style={S.featureVideo}>
              <VideoSlot src={VIDEOS[f.videoKey]} label={f.videoLabel} />
            </div>

          </div>
        </section>
      ))}

      {/* ── Social proof strip ── */}
      <section style={S.socialStrip}>
        <div style={S.socialInner}>
          {[
            { stat: "< 5 min", label: "每条视频生成时间 / per video" },
            { stat: "0 元", label: "白标网站月费 / monthly site fee" },
            { stat: "0 clicks", label: "客户预约需要点击的注册步骤 / sign-up steps for clients" },
            { stat: "100%", label: "您品牌的主页域名 / your brand domain" },
          ].map((s, i) => (
            <div key={i} style={S.statCard}>
              <div style={S.statNum}>{s.stat}</div>
              <div style={S.statLabel}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <div id="cta">
        <CTASection />
      </div>

      <style>{`
        @keyframes al-fade-up {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (max-width: 768px) {
          .al-feature-inner { flex-direction: column !important; }
          .al-feature-text  { max-width: 100% !important; }
          .al-feature-video { width: 100% !important; }
          .al-hero-pills    { flex-direction: column !important; gap: 10px !important; }
        }
      `}</style>
    </div>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  page: {
    background: "#fff",
    minHeight: "100vh",
    overflowX: "hidden",
  },

  // Hero
  hero: {
    background: "linear-gradient(160deg, #0a0f1e 0%, #0f172a 60%, #1e1b4b 100%)",
    color: "#fff",
    padding: "96px 24px 80px",
    position: "relative",
    overflow: "hidden",
    textAlign: "center",
  },
  heroInner: {
    maxWidth: 720,
    margin: "0 auto",
    position: "relative",
    zIndex: 1,
    animation: "al-fade-up 0.7s ease both",
  },
  heroPill: {
    display: "inline-block",
    background: "rgba(255,255,255,.07)",
    border: "1px solid rgba(255,255,255,.12)",
    borderRadius: 20,
    padding: "5px 16px",
    fontSize: "0.8rem",
    color: "#94a3b8",
    marginBottom: 28,
    letterSpacing: "0.03em",
  },
  heroTitle: {
    fontSize: "clamp(2.2rem, 6vw, 3.8rem)",
    fontWeight: 800,
    lineHeight: 1.15,
    color: "#f8fafc",
    margin: "0 0 20px",
    letterSpacing: "-0.02em",
  },
  heroAccent: {
    background: "linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    backgroundClip: "text",
  },
  heroSub: {
    color: "#94a3b8",
    fontSize: "1.1rem",
    lineHeight: 1.7,
    marginBottom: 40,
  },
  heroPills: {
    display: "flex",
    justifyContent: "center",
    gap: 16,
    flexWrap: "wrap",
    marginBottom: 44,
  },
  heroPillCard: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    background: "rgba(255,255,255,.06)",
    border: "1px solid rgba(255,255,255,.1)",
    borderRadius: 14,
    padding: "12px 20px",
  },
  heroBtn: {
    display: "inline-block",
    background: "linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)",
    color: "#fff",
    borderRadius: 12,
    padding: "14px 32px",
    fontWeight: 700,
    fontSize: "1rem",
    textDecoration: "none",
    boxShadow: "0 4px 20px rgba(99,102,241,.4)",
    transition: "transform 0.15s, box-shadow 0.15s",
  },
  orb: {
    position: "absolute",
    borderRadius: "50%",
    pointerEvents: "none",
  },

  // Feature sections
  featureSection: {
    padding: "80px 24px",
    borderBottom: "1px solid #f1f5f9",
  },
  featureInner: {
    maxWidth: 1100,
    margin: "0 auto",
    display: "flex",
    alignItems: "center",
    gap: 64,
    flexWrap: "wrap",
  },
  featureText: {
    flex: "1 1 360px",
    maxWidth: 520,
  },
  featureVideo: {
    flex: "1 1 320px",
    width: "100%",
    maxWidth: 500,
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 44,
    height: 44,
    borderRadius: "50%",
    background: "#0f172a",
    color: "#fff",
    fontWeight: 800,
    fontSize: "0.95rem",
    marginBottom: 16,
    letterSpacing: "0.05em",
  },
  featureTag: {
    fontSize: "0.78rem",
    fontWeight: 600,
    color: "#6366f1",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    marginBottom: 10,
  },
  featureTitle: {
    fontSize: "clamp(1.7rem, 3.5vw, 2.4rem)",
    fontWeight: 800,
    color: "#0f172a",
    lineHeight: 1.2,
    letterSpacing: "-0.02em",
    marginBottom: 8,
  },
  featureEn: {
    fontSize: "1rem",
    fontWeight: 500,
    color: "#64748b",
    marginBottom: 16,
    fontStyle: "italic",
  },
  featureDesc: {
    fontSize: "0.95rem",
    color: "#334155",
    lineHeight: 1.75,
    marginBottom: 8,
  },
  featureDescEn: {
    fontSize: "0.85rem",
    color: "#94a3b8",
    lineHeight: 1.65,
    marginBottom: 20,
  },
  bulletList: {
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  bulletItem: {
    fontSize: "0.9rem",
    color: "#334155",
    padding: "5px 0",
    display: "flex",
    alignItems: "flex-start",
  },

  // Video
  videoWrap: {
    position: "relative",
    paddingBottom: "56.25%",
    height: 0,
    borderRadius: 16,
    overflow: "hidden",
    boxShadow: "0 16px 48px rgba(0,0,0,.12)",
  },
  videoPlaceholder: {
    aspectRatio: "16/9",
    background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
    borderRadius: 16,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 16px 48px rgba(0,0,0,.12)",
    border: "1px solid #1e293b",
  },
  playBtn: {
    width: 60,
    height: 60,
    background: "rgba(255,255,255,.1)",
    border: "2px solid rgba(255,255,255,.2)",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "1.4rem",
    color: "rgba(255,255,255,.6)",
    paddingLeft: 4,
  },

  // Social proof
  socialStrip: {
    background: "#0f172a",
    padding: "60px 24px",
  },
  socialInner: {
    maxWidth: 1000,
    margin: "0 auto",
    display: "flex",
    justifyContent: "space-around",
    flexWrap: "wrap",
    gap: 32,
  },
  statCard: {
    textAlign: "center",
    flex: "1 1 160px",
  },
  statNum: {
    fontSize: "clamp(2rem, 5vw, 3rem)",
    fontWeight: 800,
    color: "#f8fafc",
    letterSpacing: "-0.03em",
    lineHeight: 1,
    marginBottom: 8,
    background: "linear-gradient(135deg, #60a5fa, #a78bfa)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    backgroundClip: "text",
  },
  statLabel: {
    fontSize: "0.8rem",
    color: "#64748b",
    lineHeight: 1.5,
  },

  // CTA
  ctaSection: {
    background: "linear-gradient(160deg, #0a0f1e 0%, #0f172a 100%)",
    padding: "100px 24px",
    textAlign: "center",
  },
  ctaInner: {
    maxWidth: 600,
    margin: "0 auto",
  },
  ctaEyebrow: {
    fontSize: "0.78rem",
    fontWeight: 600,
    color: "#6366f1",
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    marginBottom: 16,
  },
  ctaTitle: {
    fontSize: "clamp(1.8rem, 4vw, 2.8rem)",
    fontWeight: 800,
    color: "#f8fafc",
    lineHeight: 1.2,
    letterSpacing: "-0.02em",
    marginBottom: 16,
  },
  ctaForm: {
    display: "flex",
    gap: 10,
    maxWidth: 500,
    margin: "0 auto",
    flexWrap: "wrap",
    justifyContent: "center",
  },
  ctaInput: {
    flex: "1 1 240px",
    padding: "13px 18px",
    borderRadius: 10,
    border: "1.5px solid rgba(255,255,255,.15)",
    background: "rgba(255,255,255,.07)",
    color: "#f8fafc",
    fontSize: "1rem",
    outline: "none",
  },
  ctaBtn: {
    flex: "0 0 auto",
    padding: "13px 24px",
    borderRadius: 10,
    border: "none",
    background: "linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)",
    color: "#fff",
    fontWeight: 700,
    fontSize: "0.95rem",
    whiteSpace: "nowrap",
    boxShadow: "0 4px 20px rgba(99,102,241,.35)",
  },
};

export default AgentLanding;
