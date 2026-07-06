import { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import apiFetch from "../../../utils/apiFetch";

const POLL_MS = 2500;

// iOS Safari ignores `download` on cross-origin links — proxy through our API instead
const dlUrl = (url, name) =>
	`${process.env.REACT_APP_API_URL || ''}/api/xhs/download?url=${encodeURIComponent(url)}&name=${encodeURIComponent(name)}`;
const MAX_INTRO_MB = 500;
const MAX_INTRO_SECS = 300; // 5 minutes — no practical cap on recording

const STEP_LABELS = {
	"Starting...": "正在启动...",
	"Loading listing...": "加载房源...",
	"Downloading photos...": "下载图片...",
	"Creating cover...": "生成封面...",
	"Writing narration...": "撰写口播文案...",
	"Generating voiceover...": "生成AI配音...",
	"Rendering video...": "渲染视频...",
	"Mixing audio...": "混合音频...",
	"Uploading...": "上传视频...",
};

// ~4.5 chars/sec TTS × 3 sec/photo
const estimatePhotos = (text) => Math.max(1, Math.floor((text.length / 4.5 - 4) / 3));
const CHARS_PER_PHOTO = 12;

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
			setErr(`视频文件过大，请控制在 ${MAX_INTRO_MB}MB 以内`);
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
				录制或上传竖屏自拍视频，封面文字会自动叠加。可先用美颜相机录好再从相册上传。
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

const XHSVideoModal = ({ listing, onClose, onGenerated, externalListing }) => {
	const [cover1, setCover1] = useState("");
	const [cover2, setCover2] = useState("");
	const [cover3, setCover3] = useState("");
	const [introBlob, setIntroBlob] = useState(null);
	const [coverBg, setCoverBg] = useState(null);
	const [coverBgPreview, setCoverBgPreview] = useState(null);
	const [phase, setPhase] = useState("input"); // input | drafting | draft | generating | done | error
	const [narrationDraft, setNarrationDraft] = useState("");
	const [perPhoto, setPerPhoto] = useState(null);   // array mode: one string per photo
	const [photoLabels, setPhotoLabels] = useState([]);
	const [photoMap, setPhotoMap] = useState({});
	const [floorOptions, setFloorOptions] = useState({});
	const [regenLoading, setRegenLoading] = useState(false);
	const [step, setStep] = useState("");
	const [videoUrl, setVideoUrl] = useState(null);
	const [coverUrl, setCoverUrl] = useState(null);
	const [errorMsg, setErrorMsg] = useState("");
	const [listingImages, setListingImages] = useState([]);
	const [coverPhotoIndex, setCoverPhotoIndex] = useState(0);
	const [suggestingCover, setSuggestingCover] = useState(false);
	const photoCount = listingImages.length || 30; // actual photo count drives word target

	// Floor breaks — which photo number starts the upper floor / basement
	const [upperStart, setUpperStart] = useState("");
	const [basementStart, setBasementStart] = useState("");

	const pollRef = useRef(null);
	const coverBgRef = useRef(null);

	useEffect(() => {
		return () => clearInterval(pollRef.current);
	}, []);

	// Fetch listing images for cover photo picker
	useEffect(() => {
		if (externalListing?.images?.length) {
			setListingImages(externalListing.images);
			return;
		}
		const mlsNum = listing.mls_number || listing.listing_id;
		if (!mlsNum) return;
		apiFetch(`/api/listings/${mlsNum}`)
			.then(r => r.json())
			.then(data => {
				const src = data.listing || data;
				const imgs = src.image_urls || src.images || [];
				if (Array.isArray(imgs) && imgs.length > 0) setListingImages(imgs);
			})
			.catch(() => {});
	}, [listing, externalListing]);

	const mlsNumber = listing.mls_number || listing.listing_id;

	const fetchDraft = async () => {
		setErrorMsg("");
		setPhase("drafting");
		try {
			const resp = await apiFetch(`/api/xhs/agent/draft-narration/${mlsNumber}`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					cover1, cover2, cover3,
					photo_count: photoCount,
					external_listing: externalListing || undefined,
					upper_start:    upperStart    ? parseInt(upperStart,    10) : null,
					basement_start: basementStart ? parseInt(basementStart, 10) : null,
				}),
			});
			const d = await resp.json().catch(() => ({}));
			if (!resp.ok) {
				setPhase("input");
				setErrorMsg(d.error || `Error ${resp.status}`);
				return;
			}
			if (d.per_photo) {
				setPerPhoto(d.per_photo);
				// Restore previously saved labels for this listing, fall back to server labels
				const _saved = (() => { try { const s = localStorage.getItem(`xhs_labels_${mlsNumber}`); return s ? JSON.parse(s) : null; } catch { return null; } })();
				setPhotoLabels(_saved && _saved.length === (d.photo_labels || []).length ? _saved : (d.photo_labels || []));
				setFloorOptions(d.floor_options || {});
				setNarrationDraft("");
			} else {
				setNarrationDraft(d.narration || "");
				setPerPhoto(null);
				setPhotoLabels([]);
			}
			setPhotoMap(d.photo_map || {});
			setPhase("draft");
		} catch (e) {
			setPhase("input");
			setErrorMsg(String(e));
		}
	};

	const suggestCover = async () => {
		setSuggestingCover(true);
		try {
			const resp = await apiFetch(`/api/xhs/agent/suggest-cover/${mlsNumber}`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ external_listing: externalListing || undefined }),
			});
			const d = await resp.json().catch(() => ({}));
			if (resp.ok && d.lines) {
				setCover1(d.lines[0] || "");
				setCover2(d.lines[1] || "");
				setCover3(d.lines[2] || "");
			}
		} catch {}
		setSuggestingCover(false);
	};

	const saveLabels = (labels) => {
		try { localStorage.setItem(`xhs_labels_${mlsNumber}`, JSON.stringify(labels)); } catch {}
	};

	const regenFromLabels = async () => {
		setRegenLoading(true);
		setErrorMsg("");
		try {
			const resp = await apiFetch(`/api/xhs/agent/regen-per-photo/${mlsNumber}`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					photo_labels: photoLabels,
					cover1, cover2, cover3,
					upper_start:    upperStart    ? parseInt(upperStart,    10) : null,
					basement_start: basementStart ? parseInt(basementStart, 10) : null,
					external_listing: externalListing || undefined,
				}),
			});
			const d = await resp.json().catch(() => ({}));
			if (resp.ok && d.per_photo) {
				setPerPhoto(d.per_photo);
				saveLabels(photoLabels);
			} else {
				setErrorMsg(d.error || "重新生成失败");
			}
		} catch (e) {
			setErrorMsg(String(e));
		}
		setRegenLoading(false);
	};

	const startGeneration = async () => {
		if (perPhoto && photoLabels.length) saveLabels(photoLabels);
		setErrorMsg("");
		setPhase("generating");
		setStep("正在启动...");

		const formData = new FormData();
		formData.append("cover1", cover1);
		formData.append("cover2", cover2);
		formData.append("cover3", cover3);
		formData.append("cover_photo_index", coverPhotoIndex);
		formData.append("photo_count", photoCount);
		if (perPhoto) {
			formData.append("per_photo", JSON.stringify(perPhoto));
		} else {
			formData.append("narration_override", narrationDraft);
		}
		if (introBlob) {
			const ext = introBlob.type?.includes("mp4") ? "mp4" : "webm";
			formData.append("intro_video", introBlob, `intro.${ext}`);
		}
		if (coverBg) {
			formData.append("cover_bg", coverBg);
		}
		if (externalListing) {
			formData.append("external_listing", JSON.stringify(externalListing));
		}
		if (upperStart)    formData.append("upper_start",    upperStart);
		if (basementStart) formData.append("basement_start", basementStart);

		const resp = await apiFetch(`/api/xhs/agent/video/${mlsNumber}`, {
			method: "POST",
			body: formData,
		});

		if (!resp.ok) {
			const d = await resp.json().catch(() => ({}));
			setPhase("draft");
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
							<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
								<label style={{ fontWeight: 600, fontSize: "0.9rem" }}>
									封面文字 / Cover Text
								</label>
								<button type="button" className="btn btn-sm"
									style={{ fontSize: "0.75rem", padding: "3px 10px", background: "#7c3aed", borderColor: "#7c3aed" }}
									onClick={suggestCover} disabled={suggestingCover}>
									{suggestingCover ? "AI生成中..." : "✨ AI推荐"}
								</button>
							</div>
							<p style={{ color: "#64748b", fontSize: "0.78rem", marginTop: 0, marginBottom: 10 }}>
								第一、二行大字显示在人物上方，第三行小字显示在人物下方。每行最多7字。
							</p>
							{[
								[cover1, setCover1, "第一行（大字，人物上方，选填）/ Line 1 (large, above, optional)"],
								[cover2, setCover2, "第二行（大字，人物上方，选填）/ Line 2 (large, above, optional)"],
								[cover3, setCover3, "第三行（小字，人物下方，选填）/ Line 3 (small, below, optional)"],
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

						{/* Cover photo selector */}
						{listingImages.length > 1 && !coverBg && (
							<div style={{ marginBottom: 16 }}>
								<label style={{ display: "block", fontWeight: 600, marginBottom: 6, fontSize: "0.9rem" }}>
									封面照片 / Cover Photo
									<span style={{ color: "#94a3b8", fontWeight: 400, marginLeft: 8, fontSize: "0.78rem" }}>
										第 {coverPhotoIndex + 1} 张
									</span>
								</label>
								<div style={{
									display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4,
									scrollbarWidth: "thin",
								}}>
									{listingImages.map((url, idx) => (
										<div
											key={idx}
											onClick={() => setCoverPhotoIndex(idx)}
											style={{
												flexShrink: 0, cursor: "pointer",
												borderRadius: 6,
												border: idx === coverPhotoIndex ? "2.5px solid #2563eb" : "2px solid transparent",
												boxShadow: idx === coverPhotoIndex ? "0 0 0 1px #2563eb" : "none",
												overflow: "hidden",
											}}
										>
											<img
												src={url}
												alt={`Photo ${idx + 1}`}
												style={{ width: 64, height: 48, objectFit: "cover", display: "block" }}
												onError={e => { e.target.style.display = "none"; }}
											/>
										</div>
									))}
								</div>
							</div>
						)}

						<IntroSection introBlob={introBlob} setIntroBlob={setIntroBlob} />

						{/* Cover background image */}
						<div style={{ marginBottom: 16 }}>
							<label style={{ display: "block", fontWeight: 600, marginBottom: 6, fontSize: "0.9rem" }}>
								封面背景图 / Cover Background <span style={{ color: "#94a3b8", fontWeight: 400 }}>(选填)</span>
							</label>
							<p style={{ color: "#64748b", fontSize: "0.75rem", margin: "0 0 8px" }}>
								上传后作为封面底图，人物和文字叠放其上。不上传则使用房源图片。
							</p>
							{coverBgPreview ? (
								<div style={{ position: "relative", display: "inline-block" }}>
									<img src={coverBgPreview} alt="封面背景" style={{ width: 100, height: 75, objectFit: "cover", borderRadius: 8, border: "1.5px solid #e2e8f0", display: "block" }} />
									<button
										onClick={() => { URL.revokeObjectURL(coverBgPreview); setCoverBg(null); setCoverBgPreview(null); }}
										style={{ position: "absolute", top: 3, right: 3, background: "rgba(220,38,38,.8)", color: "#fff", border: "none", borderRadius: "50%", width: 20, height: 20, cursor: "pointer", fontSize: "0.7rem", lineHeight: 1, padding: 0 }}
									>✕</button>
								</div>
							) : (
								<div
									onClick={() => coverBgRef.current?.click()}
									style={{ border: "2px dashed #cbd5e1", borderRadius: 8, padding: "10px 16px", textAlign: "center", cursor: "pointer", background: "#f8fafc", color: "#64748b", fontSize: "0.8rem", display: "inline-block", minWidth: 160 }}
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

						{errorMsg && (
							<div style={{ color: "#dc2626", fontSize: "0.85rem", marginBottom: 12 }}>{errorMsg}</div>
						)}

						{/* ── 楼层分界 (Floor Breaks) ────────────────────────────── */}
						<div style={{ marginBottom: 12 }}>
							<label style={{ display: "block", fontWeight: 600, marginBottom: 6, fontSize: "0.9rem" }}>
								楼层分界 / Floor Breaks
								<span style={{ color: "#94a3b8", fontWeight: 400, fontSize: "0.78rem", marginLeft: 8 }}>
									共 {photoCount} 张
								</span>
							</label>
							<p style={{ color: "#64748b", fontSize: "0.75rem", margin: "0 0 8px" }}>
								填写上层和地下室的起始张数，AI 将按楼层分段生成口播稿。
							</p>
							<div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
								{[
									["上层", upperStart, setUpperStart],
									["地下室", basementStart, setBasementStart],
								].map(([label, val, setter]) => (
									<div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
										<span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#334155", minWidth: 32 }}>{label}</span>
										<span style={{ fontSize: "0.76rem", color: "#64748b" }}>从第</span>
										<input type="number" min={2} max={photoCount}
											value={val} onChange={e => setter(e.target.value)}
											placeholder="—"
											style={{ width: 50, padding: "3px 6px", borderRadius: 6, border: "1.5px solid #e2e8f0", fontSize: "0.82rem", textAlign: "center" }}
										/>
										<span style={{ fontSize: "0.76rem", color: "#64748b" }}>
											张起{label === "地下室" ? "（无则留空）" : ""}
										</span>
									</div>
								))}
							</div>
						</div>


						<div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
							<button className="btn btn-bl" type="button" onClick={onClose}>取消</button>
							<button className="btn" type="button" onClick={fetchDraft}>
								预览稿子 Draft Script
							</button>
						</div>
					</>
				)}

				{phase === "drafting" && (
					<div style={{ textAlign: "center", padding: "32px 0" }}>
						<div style={{
							width: 32, height: 32,
							border: "3px solid #e2e8f0", borderTop: "3px solid #3b82f6",
							borderRadius: "50%", animation: "xhs-spin 0.8s linear infinite",
							margin: "0 auto 14px",
						}} />
						<p style={{ color: "#64748b", fontSize: "0.9rem" }}>AI 正在撰写口播稿...</p>
					</div>
				)}

				{phase === "draft" && (
					<>
						<div style={{ marginBottom: 10 }}>
							<div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
								<label style={{ fontWeight: 600, fontSize: "0.9rem" }}>口播稿 / Script</label>
								<span style={{ fontSize: "0.78rem", color: "#64748b" }}>
									{perPhoto ? `${perPhoto.length} 张照片，逐张对应` : `${narrationDraft.length} 字`}
								</span>
							</div>

							{/* Per-photo list editor */}
							{perPhoto ? (() => {
								const us = upperStart    ? parseInt(upperStart,    10) : null;
								const bs = basementStart ? parseInt(basementStart, 10) : null;
								const MAIN_OPTS     = floorOptions.main_floor  || ["主层","客厅","餐厅","厨房","家庭房","卫生间"];
								const UPPER_OPTS    = floorOptions.upper_floor  || ["上层","主卧","主卧浴室","次卧","次卧浴室"];
								const BASEMENT_OPTS = floorOptions.basement     || ["地下室","客厅","房间","洗手间","厨房","户外"];
								const getOpts = pn => bs && pn >= bs ? BASEMENT_OPTS : us && pn >= us ? UPPER_OPTS : MAIN_OPTS;
								return (
									<div style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
										<div style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", padding: "6px 10px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
											<span style={{ fontSize: "0.72rem", color: "#64748b" }}>点标签换房间 · 改完点右边重新生成</span>
											<button
												type="button"
												onClick={regenFromLabels}
												disabled={regenLoading}
												style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, padding: "3px 10px", fontSize: "0.75rem", cursor: "pointer", fontWeight: 600 }}
											>{regenLoading ? "生成中..." : "↻ 重新生成文案"}</button>
										</div>
										<div style={{ maxHeight: 460, overflowY: "auto" }}>
											{perPhoto.map((text, i) => {
												const photoNum = i + 1;
												const isUpperDivider    = us && photoNum === us;
												const isBasementDivider = bs && photoNum === bs;
												const label = photoLabels[i] || "";
												const opts  = getOpts(photoNum);
												const tooShort = text.length < 8;
												const tooLong  = text.length > 25;
												return (
													<div key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
														{isUpperDivider && (
															<div style={{ background: "#f1f5f9", padding: "4px 10px", fontSize: "0.72rem", fontWeight: 700, color: "#475569", borderTop: "1px solid #e2e8f0", borderBottom: "1px solid #e2e8f0" }}>
																── 上层 Upper Floor ──
															</div>
														)}
														{isBasementDivider && (
															<div style={{ background: "#f1f5f9", padding: "4px 10px", fontSize: "0.72rem", fontWeight: 700, color: "#475569", borderTop: "1px solid #e2e8f0", borderBottom: "1px solid #e2e8f0" }}>
																── 地下室 Basement ──
															</div>
														)}
														<div style={{
															display: "flex", alignItems: "center", gap: 6,
															padding: "4px 8px 2px",
															background: tooLong ? "#fff5f5" : tooShort ? "#fffbf0" : "#fff",
														}}>
															<span style={{ minWidth: 22, fontSize: "0.68rem", color: "#94a3b8", textAlign: "right", flexShrink: 0 }}>{photoNum}</span>
															<input
																value={text}
																onChange={e => {
																	const next = [...perPhoto];
																	next[i] = e.target.value;
																	setPerPhoto(next);
																}}
																style={{ flex: 1, fontSize: "0.82rem", border: "none", outline: "none", background: "transparent", fontFamily: "inherit", minWidth: 0 }}
															/>
															<span style={{ minWidth: 28, fontSize: "0.68rem", textAlign: "right", flexShrink: 0, color: tooLong ? "#dc2626" : tooShort ? "#f97316" : "#94a3b8" }}>
																{text.length}字
															</span>
														</div>
														<div style={{ display: "flex", flexWrap: "wrap", gap: 3, padding: "2px 8px 5px 30px" }}>
															{opts.map(opt => {
																const sel = label === opt;
																return (
																	<button key={opt} type="button"
																		onClick={() => { const n2 = [...photoLabels]; n2[i] = opt; setPhotoLabels(n2); }}
																		style={{
																			padding: "1px 7px", borderRadius: 10, fontSize: "0.62rem",
																			border: sel ? "1.5px solid #7c3aed" : "1px solid #e2e8f0",
																			background: sel ? "#f3e8ff" : "#f8fafc",
																			color: sel ? "#6d28d9" : "#64748b",
																			cursor: "pointer", fontFamily: "inherit", lineHeight: 1.6,
																		}}
																	>{opt}</button>
																);
															})}
														</div>
													</div>
												);
											})}
										</div>
									</div>
								);
							})() : (
								/* Fallback: plain textarea */
								<textarea
									value={narrationDraft}
									onChange={e => setNarrationDraft(e.target.value)}
									rows={12}
									style={{
										width: "100%", boxSizing: "border-box",
										border: "1.5px solid #e2e8f0", borderRadius: 8,
										padding: "10px 12px", fontSize: "0.85rem", lineHeight: 1.7,
										resize: "vertical", fontFamily: "inherit", outline: "none",
									}}
								/>
							)}
						</div>
						{errorMsg && (
							<div style={{ color: "#dc2626", fontSize: "0.85rem", marginBottom: 10 }}>{errorMsg}</div>
						)}
						<div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
							<button className="btn btn-bl" type="button" onClick={() => { setPhase("input"); setErrorMsg(""); }}>
								← 返回
							</button>
							<button className="btn" type="button" onClick={startGeneration}
								disabled={perPhoto ? perPhoto.length === 0 : !narrationDraft.trim()}>
								确认生成视频 Generate
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
						<a href={dlUrl(videoUrl, 'video.mp4')} className="btn"
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
								<a href={dlUrl(coverUrl, 'cover.jpg')} className="btn"
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
