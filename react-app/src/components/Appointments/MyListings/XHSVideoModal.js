import { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import apiFetch from "../../../utils/apiFetch";

const POLL_MS = 2500;
const MAX_INTRO_MB = 50;
const MAX_INTRO_SECS = 10;

const STEP_LABELS = {
	"Starting...": "正在启动...",
	"Loading listing...": "加载房源...",
	"Downloading photos...": "下载图片...",
	"Creating cover...": "生成封面...",
	"Writing narration...": "撰写口播文案...",
	"Generating voiceover...": "生成AI配音...",
	"Rendering video...": "渲染视频...",
	"Mixing audio & subtitles...": "混合音频与字幕...",
	"Uploading...": "上传视频...",
};

// ── Inline intro recorder ─────────────────────────────────────────────────────

const IntroSection = ({ introBlob, setIntroBlob }) => {
	const [recording, setRecording] = useState(false);
	const [previewUrl, setPreviewUrl] = useState(null);
	const [timeLeft, setTimeLeft] = useState(MAX_INTRO_SECS);
	const [err, setErr] = useState("");

	const mediaRef = useRef(null);
	const streamRef = useRef(null);
	const chunksRef = useRef([]);
	const timerRef = useRef(null);
	const liveRef = useRef(null);
	const fileRef = useRef(null);

	useEffect(() => {
		return () => {
			clearInterval(timerRef.current);
			streamRef.current?.getTracks().forEach((t) => t.stop());
			if (previewUrl) URL.revokeObjectURL(previewUrl);
		};
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
		setErr("");
		clearBlob();
		setTimeLeft(MAX_INTRO_SECS);
		chunksRef.current = [];
		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 1280 } },
				audio: true,
			});
			streamRef.current = stream;
			if (liveRef.current) { liveRef.current.srcObject = stream; liveRef.current.play().catch(() => {}); }

			const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
				? "video/webm;codecs=vp9,opus"
				: "video/webm";
			const rec = new MediaRecorder(stream, { mimeType: mime });
			mediaRef.current = rec;
			rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
			rec.onstop = () => {
				stream.getTracks().forEach((t) => t.stop());
				if (liveRef.current) liveRef.current.srcObject = null;
				const blob = new Blob(chunksRef.current, { type: mime });
				setIntroBlob(blob);
				setPreviewUrl(URL.createObjectURL(blob));
			};
			rec.start();
			setRecording(true);
			timerRef.current = setInterval(() => {
				setTimeLeft((p) => { if (p <= 1) { stopRecording(); return 0; } return p - 1; });
			}, 1000);
		} catch {
			setErr("摄像头访问被拒绝 / Camera access denied");
		}
	};

	const pickFile = (e) => {
		const file = e.target.files?.[0];
		if (!file) return;
		if (file.size > MAX_INTRO_MB * 1024 * 1024) {
			setErr(`视频过大，请控制在 ${MAX_INTRO_MB}MB 以内`);
			e.target.value = "";
			return;
		}
		setErr("");
		clearBlob();
		setIntroBlob(file);
		setPreviewUrl(URL.createObjectURL(file));
	};

	return (
		<div style={{ marginBottom: 16 }}>
			<label style={{ display: "block", fontWeight: 600, marginBottom: 6, fontSize: "0.9rem" }}>
				开场视频（选填）/ Intro Video (optional)
			</label>
			<p style={{ color: "#64748b", fontSize: "0.78rem", margin: "0 0 10px" }}>
				录制或上传最多 10 秒竖屏自拍，封面文字会自动叠加。可先用美颜相机录好再从相册上传。
			</p>

			{recording && (
				<div style={{ position: "relative", width: 140, margin: "0 auto 10px" }}>
					<video ref={liveRef} muted playsInline
						style={{ width: "100%", borderRadius: 10, aspectRatio: "9/16", objectFit: "cover", background: "#000" }} />
					<div style={{
						position: "absolute", top: 6, right: 8,
						background: "rgba(220,38,38,.85)", color: "#fff",
						borderRadius: 20, padding: "2px 8px", fontSize: "0.75rem", fontWeight: 600,
					}}>● {timeLeft}s</div>
				</div>
			)}

			{previewUrl && !recording && (
				<div style={{ position: "relative", width: 140, margin: "0 auto 10px" }}>
					<video src={previewUrl} controls
						style={{ width: "100%", borderRadius: 10, aspectRatio: "9/16", objectFit: "cover", background: "#000" }} />
					<button onClick={clearBlob} style={{
						position: "absolute", top: 4, right: 4,
						background: "rgba(0,0,0,.6)", color: "#fff", border: "none",
						borderRadius: "50%", width: 22, height: 22, cursor: "pointer", fontSize: "0.75rem",
					}}>✕</button>
				</div>
			)}

			<input ref={fileRef} type="file" accept="video/*" style={{ display: "none" }} onChange={pickFile} />

			<div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
				{!recording ? (
					<button type="button" className="btn btn-sm" onClick={startRecording}>
						● 录制
					</button>
				) : (
					<button type="button" className="btn btn-sm btn-bl" onClick={stopRecording}>
						■ 停止 ({timeLeft}s)
					</button>
				)}
				{!recording && (
					<button type="button" className="btn btn-sm"
						style={{ background: "#7c3aed", borderColor: "#7c3aed" }}
						onClick={() => fileRef.current?.click()}>
						📷 从相册上传
					</button>
				)}
				{introBlob && !recording && (
					<button type="button" className="btn btn-sm btn-bl" onClick={clearBlob}>
						不用了 Skip
					</button>
				)}
			</div>
			{err && <div style={{ color: "#dc2626", fontSize: "0.78rem", marginTop: 6, textAlign: "center" }}>{err}</div>}
		</div>
	);
};

// ── Main modal ────────────────────────────────────────────────────────────────

const XHSVideoModal = ({ listing, onClose, onGenerated }) => {
	const [cover1, setCover1] = useState("");
	const [cover2, setCover2] = useState("");
	const [cover3, setCover3] = useState("");
	const [introBlob, setIntroBlob] = useState(null);
	const [phase, setPhase] = useState("input");
	const [step, setStep] = useState("");
	const [videoUrl, setVideoUrl] = useState(null);
	const [coverUrl, setCoverUrl] = useState(null);
	const [errorMsg, setErrorMsg] = useState("");
	const pollRef = useRef(null);

	useEffect(() => {
		return () => clearInterval(pollRef.current);
	}, []);

	const startGeneration = async () => {
		if (!cover1.trim()) {
			setErrorMsg("请输入至少第一行封面文字 / Please enter at least line 1");
			return;
		}
		setErrorMsg("");
		setPhase("generating");
		setStep("正在启动...");

		const mlsNumber = listing.mls_number || listing.listing_id;

		const formData = new FormData();
		formData.append("cover1", cover1);
		formData.append("cover2", cover2);
		formData.append("cover3", cover3);
		if (introBlob) {
			const ext = introBlob.type?.includes("mp4") ? "mp4" : "webm";
			formData.append("intro_video", introBlob, `intro.${ext}`);
		}

		const resp = await apiFetch(`/api/xhs/agent/video/${mlsNumber}`, {
			method: "POST",
			body: formData,
		});

		if (!resp.ok) {
			const d = await resp.json().catch(() => ({}));
			setPhase("error");
			setErrorMsg(d.error || `Error ${resp.status}`);
			return;
		}

		const { job_id } = await resp.json();

		pollRef.current = setInterval(async () => {
			try {
				const sr = await apiFetch(`/api/xhs/agent/video/status/${job_id}`);
				if (!sr.ok) return;
				const status = await sr.json();
				if (status.step) setStep(STEP_LABELS[status.step] || status.step);
				if (status.status === "done") {
					clearInterval(pollRef.current);
					setVideoUrl(status.url);
					if (status.cover_url) setCoverUrl(status.cover_url);
					setPhase("done");
					if (onGenerated) onGenerated({ url: status.url, expires_at: status.expires_at });
				} else if (status.status === "error") {
					clearInterval(pollRef.current);
					setPhase("error");
					setErrorMsg(status.message || "Generation failed");
				}
			} catch {
				// network hiccup, keep polling
			}
		}, POLL_MS);
	};

	const modal = (
		<div className="modal">
			<div className="modal-background" onClick={onClose} />
			<div
				className="modal-content"
				style={{
					background: "var(--bg-card, #fff)",
					borderRadius: 16,
					maxWidth: 480,
					width: "100%",
					padding: "28px 24px",
					boxShadow: "0 8px 40px rgba(0,0,0,.18)",
					maxHeight: "90vh",
					overflowY: "auto",
				}}
				onClick={(e) => e.stopPropagation()}
			>
				<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
					<h3 style={{ margin: 0, fontSize: "1.1rem" }}>生成小红书看房视频</h3>
					<button className="btn btn-sm btn-bl" onClick={onClose} style={{ padding: "4px 10px" }}>✕</button>
				</div>

				<div style={{ color: "#64748b", fontSize: "0.85rem", marginBottom: 18 }} translate="no">
					{listing.street || listing.address}
					{listing.city ? `, ${listing.city}` : ""}
				</div>

				{phase === "input" && (
					<>
						<div style={{ marginBottom: 16 }}>
							<label style={{ display: "block", fontWeight: 600, marginBottom: 8, fontSize: "0.9rem" }}>
								封面文字 / Cover Text
							</label>
							<p style={{ color: "#64748b", fontSize: "0.78rem", marginTop: 0, marginBottom: 10 }}>
								视频封面将显示这三行文字。
							</p>
							{[
								[cover1, setCover1, "第一行（大字）/ Line 1 (large)"],
								[cover2, setCover2, "第二行 / Line 2"],
								[cover3, setCover3, "第三行（小字）/ Line 3 (small)"],
							].map(([val, setter, placeholder], i) => (
								<input
									key={i}
									type="text"
									maxLength={40}
									value={val}
									onChange={(e) => setter(e.target.value)}
									placeholder={placeholder}
									className="agent-profile-input"
									style={{ marginBottom: 8, width: "100%" }}
								/>
							))}
						</div>

						<IntroSection introBlob={introBlob} setIntroBlob={setIntroBlob} />

						{errorMsg && (
							<div style={{ color: "#dc2626", fontSize: "0.85rem", marginBottom: 12 }}>{errorMsg}</div>
						)}

						<div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
							<button className="btn btn-bl" type="button" onClick={onClose}>取消</button>
							<button className="btn" type="button" onClick={startGeneration}>
								生成视频 Generate
							</button>
						</div>
					</>
				)}

				{phase === "generating" && (
					<div style={{ textAlign: "center", padding: "24px 0" }}>
						<div style={{
							width: 36, height: 36,
							border: "3px solid #e2e8f0", borderTop: "3px solid #3b82f6",
							borderRadius: "50%", animation: "xhs-spin 0.8s linear infinite",
							margin: "0 auto 16px",
						}} />
						<p style={{ color: "#334155", fontWeight: 600 }}>正在生成视频，请稍候...</p>
						<p style={{ color: "#64748b", fontSize: "0.85rem" }}>{step}</p>
						<div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 8, padding: "10px 14px", marginTop: 12, fontSize: "0.82rem", color: "#0369a1" }}>
							可以关闭此窗口，完成后会发邮件通知您下载。<br />
							You can close this window — we'll email you when it's ready.
						</div>
						<button className="btn btn-bl" style={{ marginTop: 14 }} onClick={onClose}>关闭 Close</button>
					</div>
				)}

				{phase === "done" && videoUrl && (
					<div style={{ textAlign: "center", padding: "16px 0" }}>
						<div style={{ color: "#16a34a", fontSize: "1.5rem", marginBottom: 12 }}>✓</div>
						<p style={{ fontWeight: 600, marginBottom: 16 }}>视频已生成！/ Video ready!</p>
						<video src={videoUrl} controls
							style={{ width: "100%", borderRadius: 8, marginBottom: 12 }} />
						<a href={videoUrl} download className="btn"
							style={{ display: "inline-block", textDecoration: "none", marginBottom: coverUrl ? 20 : 0 }}>
							下载视频 Download Video
						</a>
						{coverUrl && (
							<div style={{ marginTop: 4 }}>
								<p style={{ fontSize: 13, color: "#64748b", marginBottom: 8 }}>
									封面图 / Cover Image（上传为小红书封面）
								</p>
								<img src={coverUrl} alt="cover"
									style={{ width: "100%", borderRadius: 8, marginBottom: 10 }} />
								<a href={coverUrl} download className="btn"
									style={{ display: "inline-block", textDecoration: "none", background: "#f1f5f9", color: "#0f172a" }}>
									下载封面 Download Cover
								</a>
							</div>
						)}
					</div>
				)}

				{phase === "error" && (
					<div style={{ textAlign: "center", padding: "16px 0" }}>
						<div style={{ color: "#dc2626", fontSize: "1.5rem", marginBottom: 12 }}>✗</div>
						<p style={{ color: "#dc2626", fontWeight: 600, marginBottom: 8 }}>生成失败 / Failed</p>
						<p style={{ color: "#64748b", fontSize: "0.875rem", marginBottom: 16 }}>{errorMsg}</p>
						<button className="btn" onClick={() => { setPhase("input"); setErrorMsg(""); }}>重试 Retry</button>
					</div>
				)}
			</div>
		</div>
	);

	return ReactDOM.createPortal(modal, document.body);
};

export default XHSVideoModal;
