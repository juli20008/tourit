import { useState, useRef, useEffect } from "react";
import apiFetch from "../../utils/apiFetch";

const POLL_MS = 2500;
const MAX_INTRO_MB = 50;
const MAX_MAIN_MB  = 200;
const MAX_INTRO_SECS = 10;

const STEP_LABELS = {
	"Loading...":           "正在加载...",
	"Transcoding video...": "转码视频...",
	"Generating voiceover...": "生成配音...",
	"Mixing audio...":      "混合音频...",
	"Creating intro...":    "生成片头...",
	"Assembling video...":  "合成视频...",
	"Uploading...":         "上传中...",
};
const stepLabel = s => STEP_LABELS[s] || s || "";

// ── Intro recorder ────────────────────────────────────────────────────────────
const IntroSection = ({ introBlob, setIntroBlob }) => {
	const [recording, setRecording] = useState(false);
	const [previewUrl, setPreviewUrl] = useState(null);
	const [timeLeft, setTimeLeft]    = useState(MAX_INTRO_SECS);
	const [err, setErr]              = useState("");
	const mediaRef  = useRef(null);
	const streamRef = useRef(null);
	const chunksRef = useRef([]);
	const timerRef  = useRef(null);
	const liveRef   = useRef(null);
	const fileRef   = useRef(null);

	useEffect(() => () => {
		clearInterval(timerRef.current);
		streamRef.current?.getTracks().forEach(t => t.stop());
		if (previewUrl) URL.revokeObjectURL(previewUrl);
	}, [previewUrl]);

	const clearBlob = () => {
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		setPreviewUrl(null); setIntroBlob(null);
	};
	const stopRecording = () => {
		clearInterval(timerRef.current);
		if (mediaRef.current?.state !== "inactive") mediaRef.current.stop();
		setRecording(false);
	};
	const startRecording = async () => {
		setErr(""); clearBlob(); setTimeLeft(MAX_INTRO_SECS); chunksRef.current = [];
		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 1280 } }, audio: true,
			});
			streamRef.current = stream;
			if (liveRef.current) { liveRef.current.srcObject = stream; liveRef.current.play().catch(() => {}); }
			const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus") ? "video/webm;codecs=vp9,opus" : "video/webm";
			const rec = new MediaRecorder(stream, { mimeType: mime });
			mediaRef.current = rec;
			rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
			rec.onstop = () => {
				stream.getTracks().forEach(t => t.stop());
				if (liveRef.current) liveRef.current.srcObject = null;
				const blob = new Blob(chunksRef.current, { type: mime });
				setIntroBlob(blob); setPreviewUrl(URL.createObjectURL(blob));
			};
			rec.start(); setRecording(true);
			timerRef.current = setInterval(() => {
				setTimeLeft(p => { if (p <= 1) { stopRecording(); return 0; } return p - 1; });
			}, 1000);
		} catch { setErr("摄像头访问被拒绝 / Camera access denied"); }
	};
	const pickFile = e => {
		const file = e.target.files?.[0];
		if (!file) return;
		if (file.size > MAX_INTRO_MB * 1024 * 1024) { setErr(`视频过大，请控制在 ${MAX_INTRO_MB}MB 以内`); e.target.value = ""; return; }
		setErr(""); clearBlob(); setIntroBlob(file); setPreviewUrl(URL.createObjectURL(file));
	};

	return (
		<div style={{ marginBottom: 20 }}>
			<label style={{ display: "block", fontWeight: 600, marginBottom: 6, fontSize: "0.9rem" }}>
				开场视频（选填）/ Intro Video (optional)
			</label>
			<p style={{ color: "#64748b", fontSize: "0.78rem", margin: "0 0 10px" }}>
				最多 10 秒竖屏自拍，封面文字自动叠加。
			</p>
			{recording && (
				<div style={{ position: "relative", width: 120, margin: "0 auto 10px" }}>
					<video ref={liveRef} muted playsInline style={{ width: "100%", borderRadius: 10, aspectRatio: "9/16", objectFit: "cover", background: "#000" }} />
					<div style={{ position: "absolute", top: 6, right: 8, background: "rgba(220,38,38,.85)", color: "#fff", borderRadius: 20, padding: "2px 8px", fontSize: "0.75rem", fontWeight: 600 }}>● {timeLeft}s</div>
				</div>
			)}
			{previewUrl && !recording && (
				<div style={{ position: "relative", width: 120, margin: "0 auto 10px" }}>
					<video src={previewUrl} controls style={{ width: "100%", borderRadius: 10, aspectRatio: "9/16", objectFit: "cover", background: "#000" }} />
					<button onClick={clearBlob} style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,.6)", color: "#fff", border: "none", borderRadius: "50%", width: 22, height: 22, cursor: "pointer", fontSize: "0.75rem" }}>✕</button>
				</div>
			)}
			<input ref={fileRef} type="file" accept="video/*" style={{ display: "none" }} onChange={pickFile} />
			<div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
				{!recording
					? <button type="button" className="btn btn-sm" onClick={startRecording}>● 录制</button>
					: <button type="button" className="btn btn-sm btn-bl" onClick={stopRecording}>■ 停止 ({timeLeft}s)</button>}
				{!recording && <button type="button" className="btn btn-sm" style={{ background: "#7c3aed", borderColor: "#7c3aed" }} onClick={() => fileRef.current?.click()}>📷 从相册上传</button>}
				{introBlob && !recording && <button type="button" className="btn btn-sm btn-bl" onClick={clearBlob}>不用了 Skip</button>}
			</div>
			{err && <div style={{ color: "#dc2626", fontSize: "0.78rem", marginTop: 6, textAlign: "center" }}>{err}</div>}
		</div>
	);
};

// ── Main page ─────────────────────────────────────────────────────────────────
const NewHomeVideo = () => {
	const [phase, setPhase]         = useState("input");
	const [mainFile, setMainFile]   = useState(null);
	const [mainErr, setMainErr]     = useState("");
	const [narration, setNarration] = useState("");
	const [cover1, setCover1]       = useState("");
	const [cover2, setCover2]       = useState("");
	const [cover3, setCover3]       = useState("");
	const [introBlob, setIntroBlob]       = useState(null);
	const [coverBg, setCoverBg]           = useState(null);
	const [aiLoading, setAiLoading]       = useState(false);
	const [coverBgPreview, setCoverBgPreview] = useState(null);
	const [step, setStep]                 = useState("");
	const [videoUrl, setVideoUrl]         = useState(null);
	const [coverUrl, setCoverUrl]         = useState(null);
	const [expiresAt, setExpiresAt]       = useState(null);
	const [errMsg, setErrMsg]             = useState("");
	const pollRef     = useRef(null);
	const mainRef     = useRef(null);
	const coverBgRef  = useRef(null);

	useEffect(() => () => {
		clearInterval(pollRef.current);
	}, []);

	const pickMain = e => {
		const file = e.target.files?.[0];
		if (!file) return;
		if (file.size > MAX_MAIN_MB * 1024 * 1024) {
			setMainErr(`视频过大（最大 ${MAX_MAIN_MB}MB）`); e.target.value = ""; return;
		}
		setMainErr("");
		setMainFile(file);
	};

	const startGeneration = async () => {
		if (!mainFile) { setMainErr("请先上传主视频"); return; }
		setPhase("generating");
		const fd = new FormData();
		fd.append("main_video", mainFile);
		fd.append("narration", narration);
		fd.append("cover1", cover1);
		fd.append("cover2", cover2);
		fd.append("cover3", cover3);
		if (introBlob) fd.append("intro_video", introBlob, "intro.webm");
		if (coverBg) fd.append("cover_bg", coverBg);

		try {
			const res = await apiFetch("/api/new-home-videos/generate", { method: "POST", body: fd });
			let data;
			try { data = await res.json(); } catch { throw new Error(`服务器错误 (${res.status})，请稍后重试`); }
			if (!res.ok || !data.job_id) throw new Error(data.error || "启动失败");
			pollRef.current = setInterval(() => pollStatus(data.job_id), POLL_MS);
		} catch (e) {
			setErrMsg(e.message); setPhase("error");
		}
	};

	const pollStatus = async (jid) => {
		try {
			const res  = await apiFetch(`/api/new-home-videos/status/${jid}`);
			const data = await res.json();
			if (data.step) setStep(data.step);
			if (data.status === "done") {
				clearInterval(pollRef.current);
				setVideoUrl(data.url);
				if (data.cover_url) setCoverUrl(data.cover_url);
				if (data.expires_at) setExpiresAt(data.expires_at);
				setPhase("done");
			} else if (data.status === "error") {
				clearInterval(pollRef.current);
				setErrMsg(data.message || "生成失败"); setPhase("error");
			}
		} catch {}
	};

	const reset = () => {
		clearInterval(pollRef.current);
		if (coverBgPreview) URL.revokeObjectURL(coverBgPreview);
		setPhase("input"); setMainFile(null); setIntroBlob(null);
		setCoverBg(null); setCoverBgPreview(null); setAiLoading(false);
		setNarration(""); setCover1(""); setCover2(""); setCover3("");
		setStep(""); setVideoUrl(null); setCoverUrl(null); setExpiresAt(null);
		setErrMsg(""); setMainErr("");
	};

	const expiryLabel = expiresAt ? (() => {
		const d = Math.ceil((new Date(expiresAt) - Date.now()) / 86400000);
		return `视频将在 ${d} 天后过期 · Expires in ${d} days`;
	})() : "";

	return (
		<div style={{ maxWidth: 680, margin: "0 auto", padding: "32px 20px 64px" }}>
			<h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#0f172a", marginBottom: 4 }}>新房视频</h1>
			<p style={{ color: "#64748b", fontSize: "0.9rem", marginBottom: 28 }}>
				上传新房主视频，输入旁白讲解，自动用您的克隆声音重新配音生成专业视频。
			</p>

			{phase === "input" && (
				<div style={{ background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 16, padding: "28px 24px" }}>

					{/* Main video upload */}
					<div style={{ marginBottom: 24 }}>
						<label style={{ display: "block", fontWeight: 600, marginBottom: 6, fontSize: "0.9rem" }}>
							主视频 / Main Video <span style={{ color: "#dc2626" }}>*</span>
							<span style={{ color: "#94a3b8", fontWeight: 400, marginLeft: 8, fontSize: "0.8rem" }}>最大 {MAX_MAIN_MB}MB</span>
						</label>
						{mainFile ? (
							<div style={{ display: "flex", alignItems: "center", gap: 12, background: "#f0fdf4", border: "1.5px solid #bbf7d0", borderRadius: 10, padding: "12px 16px", marginBottom: 10 }}>
								<span style={{ fontSize: "1.4rem" }}>🎬</span>
								<div style={{ flex: 1, minWidth: 0 }}>
									<div style={{ fontWeight: 600, fontSize: "0.88rem", color: "#166534", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{mainFile.name}</div>
									<div style={{ fontSize: "0.78rem", color: "#16a34a" }}>{(mainFile.size / 1024 / 1024).toFixed(1)} MB ✓</div>
								</div>
								<button onClick={() => setMainFile(null)}
									style={{ background: "rgba(0,0,0,.15)", color: "#166534", border: "none", borderRadius: "50%", width: 26, height: 26, cursor: "pointer", fontSize: "0.85rem", flexShrink: 0 }}>✕</button>
							</div>
						) : (
							<div
								onClick={() => mainRef.current?.click()}
								style={{ border: "2px dashed #cbd5e1", borderRadius: 10, padding: "24px", textAlign: "center", cursor: "pointer", background: "#f8fafc", color: "#64748b", fontSize: "0.88rem" }}
							>
								点击上传主视频 / Click to upload main video<br />
								<span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>MP4 · MOV · 最大 {MAX_MAIN_MB}MB</span>
							</div>
						)}
						<input ref={mainRef} type="file" accept="video/*" style={{ display: "none" }} onChange={pickMain} />
						{mainErr && <div style={{ color: "#dc2626", fontSize: "0.78rem", marginTop: 4 }}>{mainErr}</div>}
					</div>

					{/* Narration */}
					<div style={{ marginBottom: 24 }}>
						<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
							<label style={{ fontWeight: 600, fontSize: "0.9rem" }}>
								旁白讲解 / Narration
							</label>
							<button
								type="button"
								disabled={aiLoading}
								onClick={async () => {
									setAiLoading(true);
									try {
										const res = await apiFetch("/api/new-home-videos/narration-hint", {
											method: "POST",
											headers: { "Content-Type": "application/json" },
											body: JSON.stringify({ cover1, cover2, cover3, existing: narration }),
										});
										const d = await res.json();
										if (d.narration) setNarration(d.narration);
									} catch {}
									setAiLoading(false);
								}}
								style={{ fontSize: "0.78rem", padding: "4px 10px", background: aiLoading ? "#e2e8f0" : "#7c3aed", color: aiLoading ? "#94a3b8" : "#fff", border: "none", borderRadius: 6, cursor: aiLoading ? "default" : "pointer", fontWeight: 600 }}
							>
								{aiLoading ? "生成中..." : "✨ AI生成旁白"}
							</button>
						</div>
						<p style={{ color: "#64748b", fontSize: "0.78rem", margin: "0 0 8px" }}>
							输入您的讲解文字，将由您的克隆声音朗读并替换视频原有声音。留空则使用默认问候语。
						</p>
						<textarea
							rows={6}
							value={narration}
							onChange={e => setNarration(e.target.value)}
							placeholder="输入旁白内容，例如：这套房子位于 Markham 核心地段，三卧两卫，宽敞的开放式厨房......"
							className="agent-profile-input"
							style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
						/>
					</div>

					{/* Cover lines */}
					<div style={{ marginBottom: 24 }}>
						<label style={{ display: "block", fontWeight: 600, marginBottom: 6, fontSize: "0.9rem" }}>
							封面文字 / Cover Text
						</label>
						<p style={{ color: "#64748b", fontSize: "0.78rem", margin: "0 0 10px" }}>
							第一、二行大字显示在人物上方，第三行根据字数自动调节大小显示在人物下方。
						</p>
						{[
							[cover1, setCover1, "第一行（大字，人物上方）/ Line 1 (large, above)"],
							[cover2, setCover2, "第二行（大字，人物上方）/ Line 2 (large, above)"],
							[cover3, setCover3, "第三行（人物下方）/ Line 3 (below)"],
						].map(([val, setter, ph], i) => (
							<input key={i} type="text" maxLength={40} value={val}
								onChange={e => setter(e.target.value)} placeholder={ph}
								className="agent-profile-input" style={{ marginBottom: 8, width: "100%" }} />
						))}
					</div>

					{/* Cover background image */}
					<div style={{ marginBottom: 24 }}>
						<label style={{ display: "block", fontWeight: 600, marginBottom: 6, fontSize: "0.9rem" }}>
							封面背景图 / Cover Background <span style={{ color: "#94a3b8", fontWeight: 400 }}>(选填)</span>
						</label>
						<p style={{ color: "#64748b", fontSize: "0.78rem", margin: "0 0 10px" }}>
							上传后将作为封面底图，人物抠图和封面文字叠放其上。不上传则使用主视频第一帧。
						</p>
						{coverBgPreview ? (
							<div style={{ position: "relative", display: "inline-block" }}>
								<img src={coverBgPreview} alt="封面背景" style={{ width: 120, height: 90, objectFit: "cover", borderRadius: 8, border: "1.5px solid #e2e8f0", display: "block" }} />
								<button
									onClick={() => { URL.revokeObjectURL(coverBgPreview); setCoverBg(null); setCoverBgPreview(null); }}
									style={{ position: "absolute", top: 3, right: 3, background: "rgba(220,38,38,.8)", color: "#fff", border: "none", borderRadius: "50%", width: 20, height: 20, cursor: "pointer", fontSize: "0.7rem", lineHeight: 1, padding: 0 }}
								>✕</button>
							</div>
						) : (
							<div
								onClick={() => coverBgRef.current?.click()}
								style={{ border: "2px dashed #cbd5e1", borderRadius: 10, padding: "14px 18px", textAlign: "center", cursor: "pointer", background: "#f8fafc", color: "#64748b", fontSize: "0.82rem", display: "inline-block", minWidth: 180 }}
							>
								+ 上传背景图
							</div>
						)}
						<input ref={coverBgRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => {
							const f = e.target.files?.[0];
							if (!f) return;
							if (coverBgPreview) URL.revokeObjectURL(coverBgPreview);
							setCoverBg(f);
							setCoverBgPreview(URL.createObjectURL(f));
							e.target.value = "";
						}} />
					</div>

					{/* Intro video */}
					<IntroSection introBlob={introBlob} setIntroBlob={setIntroBlob} />

					<button
						className="btn btn-sm"
						style={{ width: "100%", padding: "13px 0", fontSize: "1rem", fontWeight: 700 }}
						onClick={startGeneration}
					>
						生成视频 Generate Video
					</button>
				</div>
			)}

			{phase === "generating" && (
				<div style={{ textAlign: "center", padding: "60px 24px" }}>
					<div style={{ fontSize: "2.5rem", marginBottom: 16 }}>⏳</div>
					<div style={{ fontWeight: 700, fontSize: "1.1rem", color: "#0f172a", marginBottom: 8 }}>正在生成视频，请稍候...</div>
					<div style={{ color: "#64748b", fontSize: "0.88rem" }}>{stepLabel(step) || "正在启动..."}</div>
					<div style={{ color: "#94a3b8", fontSize: "0.78rem", marginTop: 16 }}>通常需要 2–5 分钟，取决于视频长度</div>
				</div>
			)}

			{phase === "done" && (
				<div style={{ background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 16, padding: "28px 24px" }}>
					<div style={{ color: "#16a34a", fontWeight: 700, marginBottom: 16, fontSize: "1rem" }}>✅ 视频已生成 / Video Ready</div>
					{videoUrl && (
						<video src={videoUrl} controls playsInline
							style={{ width: "100%", borderRadius: 12, maxHeight: 480, background: "#000", marginBottom: 12 }} />
					)}
					<div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
						{videoUrl && (
							<a href={videoUrl} download target="_blank" rel="noopener noreferrer"
								className="btn btn-sm" style={{ textDecoration: "none" }}>⬇ 下载视频</a>
						)}
						{coverUrl && (
							<a href={coverUrl} download target="_blank" rel="noopener noreferrer"
								className="btn btn-sm" style={{ background: "#7c3aed", borderColor: "#7c3aed", textDecoration: "none" }}>⬇ 下载封面</a>
						)}
					</div>
					{expiryLabel && <div style={{ color: "#94a3b8", fontSize: "0.78rem", marginBottom: 16 }}>{expiryLabel}</div>}
					<button className="btn btn-sm btn-bl" onClick={reset}>重新生成 New Video</button>
				</div>
			)}

			{phase === "error" && (
				<div style={{ background: "#fff", border: "1.5px solid #fecaca", borderRadius: 16, padding: "28px 24px", textAlign: "center" }}>
					<div style={{ color: "#dc2626", fontWeight: 700, marginBottom: 8 }}>生成失败 / Generation Failed</div>
					<div style={{ color: "#64748b", fontSize: "0.88rem", marginBottom: 20 }}>{errMsg}</div>
					<button className="btn btn-sm" onClick={reset}>重试 Retry</button>
				</div>
			)}
		</div>
	);
};

export default NewHomeVideo;
