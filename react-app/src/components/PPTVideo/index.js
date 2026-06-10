import { useState, useRef, useEffect } from "react";
import apiFetch from "../../utils/apiFetch";

const POLL_MS = 2500;
const MAX_SLIDES = 5;
const MAX_INTRO_MB = 50;
const MAX_INTRO_SECS = 10;

const STEP_LABELS = {
	"Loading...":             "正在加载...",
	"Converting slides...":   "正在转换幻灯片...",
	"Creating intro...":      "生成片头...",
	"Generating voiceover 1/1...": "生成配音 1/1...",
	"Assembling video...":    "合成视频...",
	"Mixing audio...":        "混合音频...",
	"Uploading...":           "上传中...",
};

const stepLabel = (step) => {
	if (!step) return "";
	if (STEP_LABELS[step]) return STEP_LABELS[step];
	// Dynamic steps like "Generating voiceover 2/5..." or "Rendering slide 3/5..."
	const voiceMatch = step.match(/^Generating voiceover (\d+)\/(\d+)/);
	if (voiceMatch) return `生成配音 ${voiceMatch[1]}/${voiceMatch[2]}...`;
	const renderMatch = step.match(/^Rendering slide (\d+)\/(\d+)/);
	if (renderMatch) return `渲染幻灯片 ${renderMatch[1]}/${renderMatch[2]}...`;
	return step;
};

// ── Intro recorder (same as XHS video) ───────────────────────────────────────

const IntroSection = ({ introBlob, setIntroBlob }) => {
	const [recording, setRecording]   = useState(false);
	const [previewUrl, setPreviewUrl] = useState(null);
	const [timeLeft, setTimeLeft]     = useState(MAX_INTRO_SECS);
	const [err, setErr]               = useState("");
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
		setPreviewUrl(null);
		setIntroBlob(null);
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
				setIntroBlob(blob);
				setPreviewUrl(URL.createObjectURL(blob));
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
				录制或上传最多 10 秒竖屏自拍，封面文字会自动叠加。
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
					: <button type="button" className="btn btn-sm btn-bl" onClick={stopRecording}>■ 停止 ({timeLeft}s)</button>
				}
				{!recording && <button type="button" className="btn btn-sm" style={{ background: "#7c3aed", borderColor: "#7c3aed" }} onClick={() => fileRef.current?.click()}>📷 从相册上传</button>}
				{introBlob && !recording && <button type="button" className="btn btn-sm btn-bl" onClick={clearBlob}>不用了 Skip</button>}
			</div>
			{err && <div style={{ color: "#dc2626", fontSize: "0.78rem", marginTop: 6, textAlign: "center" }}>{err}</div>}
		</div>
	);
};

// ── Main page ─────────────────────────────────────────────────────────────────

const PPTVideo = () => {
	const [phase, setPhase]         = useState("input"); // input | generating | done | error
	const [pptxFile, setPptxFile]   = useState(null);
	const [slideTexts, setSlideTexts] = useState(Array(MAX_SLIDES).fill(""));
	const [cover1, setCover1]       = useState("");
	const [cover2, setCover2]       = useState("");
	const [cover3, setCover3]       = useState("");
	const [introBlob, setIntroBlob] = useState(null);
	const [jobId, setJobId]         = useState(null);
	const [step, setStep]           = useState("");
	const [videoUrl, setVideoUrl]   = useState(null);
	const [coverUrl, setCoverUrl]   = useState(null);
	const [expiresAt, setExpiresAt] = useState(null);
	const [errMsg, setErrMsg]       = useState("");
	const [pptxErr, setPptxErr]     = useState("");
	const pollRef   = useRef(null);
	const pptxRef   = useRef(null);

	useEffect(() => () => clearInterval(pollRef.current), []);

	const handleSlideText = (i, val) => {
		setSlideTexts(prev => { const next = [...prev]; next[i] = val; return next; });
	};

	const pickPPTX = e => {
		const file = e.target.files?.[0];
		if (!file) return;
		if (file.size > 50 * 1024 * 1024) { setPptxErr("文件过大（最大 50MB）"); e.target.value = ""; return; }
		setPptxErr("");
		setPptxFile(file);
	};

	const startGeneration = async () => {
		if (!pptxFile) { setPptxErr("请先选择 PPT 文件"); return; }
		setPhase("generating");
		const fd = new FormData();
		fd.append("pptx", pptxFile);
		slideTexts.forEach((t, i) => fd.append(`slide_${i + 1}`, t));
		fd.append("cover1", cover1);
		fd.append("cover2", cover2);
		fd.append("cover3", cover3);
		if (introBlob) fd.append("intro_video", introBlob, "intro.webm");

		try {
			const res = await apiFetch("/api/ppt-videos/generate", { method: "POST", body: fd });
			const data = await res.json();
			if (!res.ok || !data.job_id) throw new Error(data.error || "启动失败");
			setJobId(data.job_id);
			pollRef.current = setInterval(() => pollStatus(data.job_id), POLL_MS);
		} catch (e) {
			setErrMsg(e.message);
			setPhase("error");
		}
	};

	const pollStatus = async (jid) => {
		try {
			const res  = await apiFetch(`/api/ppt-videos/status/${jid}`);
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
				setErrMsg(data.message || "生成失败");
				setPhase("error");
			}
		} catch {}
	};

	const reset = () => {
		clearInterval(pollRef.current);
		setPhase("input"); setPptxFile(null); setIntroBlob(null);
		setSlideTexts(Array(MAX_SLIDES).fill(""));
		setCover1(""); setCover2(""); setCover3("");
		setJobId(null); setStep(""); setVideoUrl(null); setCoverUrl(null);
		setExpiresAt(null); setErrMsg(""); setPptxErr("");
	};

	const expiryLabel = expiresAt ? (() => {
		const d = Math.ceil((new Date(expiresAt) - Date.now()) / 86400000);
		return `视频将在 ${d} 天后过期 · Expires in ${d} days`;
	})() : "";

	return (
		<div style={{ maxWidth: 680, margin: "0 auto", padding: "32px 20px 64px" }}>
			<h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#0f172a", marginBottom: 4 }}>
				数分视频
			</h1>
			<p style={{ color: "#64748b", fontSize: "0.9rem", marginBottom: 28 }}>
				上传 PPT（3–5 页），输入每页旁白，自动生成您的专业讲解视频。
			</p>

			{/* ── Input phase ── */}
			{phase === "input" && (
				<div style={{ background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 16, padding: "28px 24px" }}>

					{/* PPT upload */}
					<div style={{ marginBottom: 24 }}>
						<label style={{ display: "block", fontWeight: 600, marginBottom: 6, fontSize: "0.9rem" }}>
							PPT 文件 / PPTX File <span style={{ color: "#dc2626" }}>*</span>
						</label>
						<div
							onClick={() => pptxRef.current?.click()}
							style={{
								border: "2px dashed #cbd5e1", borderRadius: 10, padding: "20px",
								textAlign: "center", cursor: "pointer", background: pptxFile ? "#f0fdf4" : "#f8fafc",
								color: pptxFile ? "#15803d" : "#64748b", fontSize: "0.88rem",
							}}
						>
							{pptxFile
								? `✓ ${pptxFile.name}`
								: "点击上传 .pptx 文件（最多 5 页，50MB）\nClick to upload .pptx (max 5 slides, 50 MB)"
							}
						</div>
						<input ref={pptxRef} type="file" accept=".pptx,.ppt" style={{ display: "none" }} onChange={pickPPTX} />
						{pptxErr && <div style={{ color: "#dc2626", fontSize: "0.78rem", marginTop: 4 }}>{pptxErr}</div>}
					</div>

					{/* Per-slide narrations */}
					<div style={{ marginBottom: 24 }}>
						<label style={{ display: "block", fontWeight: 600, marginBottom: 6, fontSize: "0.9rem" }}>
							每页旁白 / Per-slide Narration
						</label>
						<p style={{ color: "#64748b", fontSize: "0.78rem", margin: "0 0 10px" }}>
							填写与您的幻灯片数量相同的旁白。未填写的页面将跳过。
						</p>
						{slideTexts.map((text, i) => (
							<div key={i} style={{ marginBottom: 10 }}>
								<div style={{ fontSize: "0.78rem", color: "#94a3b8", marginBottom: 3 }}>
									第 {i + 1} 页 / Slide {i + 1}
								</div>
								<textarea
									rows={3}
									value={text}
									onChange={e => handleSlideText(i, e.target.value)}
									placeholder={`第${i + 1}页的讲解内容...`}
									className="agent-profile-input"
									style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
								/>
							</div>
						))}
					</div>

					{/* Cover lines */}
					<div style={{ marginBottom: 24 }}>
						<label style={{ display: "block", fontWeight: 600, marginBottom: 6, fontSize: "0.9rem" }}>
							封面文字 / Cover Text
						</label>
						<p style={{ color: "#64748b", fontSize: "0.78rem", margin: "0 0 10px" }}>
							第一、二行大字显示在人物上方，第三行小字显示在人物下方。
						</p>
						{[
							[cover1, setCover1, "第一行（大字，人物上方）/ Line 1 (large, above)"],
							[cover2, setCover2, "第二行（大字，人物上方）/ Line 2 (large, above)"],
							[cover3, setCover3, "第三行（小字，人物下方）/ Line 3 (small, below)"],
						].map(([val, setter, ph], i) => (
							<input key={i} type="text" maxLength={40} value={val}
								onChange={e => setter(e.target.value)}
								placeholder={ph}
								className="agent-profile-input"
								style={{ marginBottom: 8, width: "100%" }}
							/>
						))}
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

			{/* ── Generating phase ── */}
			{phase === "generating" && (
				<div style={{ textAlign: "center", padding: "60px 24px" }}>
					<div style={{ fontSize: "2.5rem", marginBottom: 16 }}>⏳</div>
					<div style={{ fontWeight: 700, fontSize: "1.1rem", color: "#0f172a", marginBottom: 8 }}>
						正在生成视频，请稍候...
					</div>
					<div style={{ color: "#64748b", fontSize: "0.88rem" }}>
						{stepLabel(step) || "正在启动..."}
					</div>
					<div style={{ color: "#94a3b8", fontSize: "0.78rem", marginTop: 16 }}>
						根据幻灯片数量，通常需要 1–3 分钟
					</div>
				</div>
			)}

			{/* ── Done phase ── */}
			{phase === "done" && (
				<div style={{ background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 16, padding: "28px 24px" }}>
					<div style={{ color: "#16a34a", fontWeight: 700, marginBottom: 16, fontSize: "1rem" }}>
						✅ 视频已生成 / Video Ready
					</div>
					{videoUrl && (
						<video src={videoUrl} controls playsInline
							style={{ width: "100%", borderRadius: 12, maxHeight: 480, background: "#000", marginBottom: 12 }}
						/>
					)}
					<div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
						{videoUrl && (
							<a href={videoUrl} download target="_blank" rel="noopener noreferrer"
								className="btn btn-sm" style={{ textDecoration: "none" }}>
								⬇ 下载视频 Download Video
							</a>
						)}
						{coverUrl && (
							<a href={coverUrl} download target="_blank" rel="noopener noreferrer"
								className="btn btn-sm" style={{ background: "#7c3aed", borderColor: "#7c3aed", textDecoration: "none" }}>
								⬇ 下载封面 Download Cover
							</a>
						)}
					</div>
					{expiryLabel && (
						<div style={{ color: "#94a3b8", fontSize: "0.78rem", marginBottom: 16 }}>{expiryLabel}</div>
					)}
					<button className="btn btn-sm btn-bl" onClick={reset}>重新生成 New Video</button>
				</div>
			)}

			{/* ── Error phase ── */}
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

export default PPTVideo;
