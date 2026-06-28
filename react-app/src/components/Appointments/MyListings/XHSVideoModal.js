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
const CHARS_PER_PHOTO = 14;

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
	const [step, setStep] = useState("");
	const [videoUrl, setVideoUrl] = useState(null);
	const [coverUrl, setCoverUrl] = useState(null);
	const [errorMsg, setErrorMsg] = useState("");
	const [listingImages, setListingImages] = useState([]);
	const [coverPhotoIndex, setCoverPhotoIndex] = useState(0);
	const photoCount = listingImages.length || 30; // actual photo count drives word target

	// Floor breaks — which photo number starts the upper floor / basement
	const [upperStart, setUpperStart] = useState("");
	const [basementStart, setBasementStart] = useState("");

	// Room ranges within floors — { start, end } 1-indexed, for word-count alignment
	const ROOM_GROUPS = [
		{
			floor: "main", label: "主层",
			rooms: [
				{ key: "exterior",   label: "室外" },
				{ key: "living",     label: "客厅" },
				{ key: "kitchen",    label: "厨房餐厅" },
				{ key: "main_other", label: "其他主层" },
			],
		},
		{
			floor: "upper", label: "上层",
			rooms: [
				{ key: "master_suite", label: "主卧套件" },
				{ key: "upper_other",  label: "其他房间" },
			],
		},
		{
			floor: "basement", label: "地下室",
			rooms: [
				{ key: "basement", label: "地下室" },
				{ key: "other",    label: "其他（户外）" },
			],
		},
	];
	const ROOMS = ROOM_GROUPS.flatMap(g => g.rooms);
	const [ranges, setRanges] = useState(() =>
		Object.fromEntries(ROOMS.map(r => [r.key, { start: "", end: "" }]))
	);
	const setRange = (key, field, val) =>
		setRanges(prev => ({ ...prev, [key]: { ...prev[key], [field]: val } }));
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
					photo_ranges: Object.fromEntries(
						Object.entries(ranges)
							.filter(([, v]) => v.start && v.end && parseInt(v.end, 10) >= parseInt(v.start, 10))
							.map(([k, v]) => [k, { start: parseInt(v.start, 10), end: parseInt(v.end, 10) }])
					),
				}),
			});
			const d = await resp.json().catch(() => ({}));
			if (!resp.ok) {
				setPhase("input");
				setErrorMsg(d.error || `Error ${resp.status}`);
				return;
			}
			setNarrationDraft(d.narration || "");
			setPhase("draft");
		} catch (e) {
			setPhase("input");
			setErrorMsg(String(e));
		}
	};

	const startGeneration = async () => {
		setErrorMsg("");
		setPhase("generating");
		setStep("正在启动...");

		const formData = new FormData();
		formData.append("cover1", cover1);
		formData.append("cover2", cover2);
		formData.append("cover3", cover3);
		formData.append("cover_photo_index", coverPhotoIndex);
		formData.append("photo_count", photoCount);
		formData.append("narration_override", narrationDraft);
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
		const filledRanges = Object.fromEntries(
			Object.entries(ranges)
				.filter(([, v]) => v.start && v.end && parseInt(v.end, 10) >= parseInt(v.start, 10))
				.map(([k, v]) => [k, { start: parseInt(v.start, 10), end: parseInt(v.end, 10) }])
		);
		if (Object.keys(filledRanges).length > 0) {
			formData.append("photo_ranges", JSON.stringify(filledRanges));
		}

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
							<label style={{ display: "block", fontWeight: 600, marginBottom: 8, fontSize: "0.9rem" }}>
								封面文字 / Cover Text
							</label>
							<p style={{ color: "#64748b", fontSize: "0.78rem", marginTop: 0, marginBottom: 10 }}>
								第一、二行大字显示在人物上方，第三行小字显示在人物下方。
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

						{/* ── 照片细分 (Room Ranges for word-count alignment) ─────── */}
						<div style={{ marginBottom: 16 }}>
							<label style={{ display: "block", fontWeight: 600, marginBottom: 4, fontSize: "0.9rem" }}>
								照片细分 / Room Ranges
								<span style={{ color: "#94a3b8", fontWeight: 400, fontSize: "0.78rem", marginLeft: 8 }}>
									（选填，帮助字数精准对齐）
								</span>
							</label>
							<p style={{ color: "#64748b", fontSize: "0.75rem", margin: "0 0 10px" }}>
								指定每个区域的起止照片，编辑器会实时显示每楼层应写多少字。留空的区域不影响生成。
							</p>
							{ROOM_GROUPS.map(({ floor, label: floorLabel, rooms }) => (
								<div key={floor} style={{ marginBottom: 10 }}>
									<div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#7c3aed", marginBottom: 4, letterSpacing: 0.3 }}>
										▸ {floorLabel}
									</div>
									<table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 4px", paddingLeft: 8 }}>
										<tbody>
											{rooms.map(({ key, label }) => {
												const s = ranges[key].start ? parseInt(ranges[key].start, 10) : null;
												const e = ranges[key].end   ? parseInt(ranges[key].end,   10) : null;
												const valid = s && e && e >= s;
												const count = valid ? e - s + 1 : null;
												return (
													<tr key={key}>
														<td style={{ fontSize: "0.78rem", fontWeight: 600, color: "#334155", paddingRight: 8, whiteSpace: "nowrap", width: 76, verticalAlign: "middle" }}>
															{label}
														</td>
														<td style={{ verticalAlign: "middle" }}>
															<span style={{ fontSize: "0.74rem", color: "#64748b" }}>从第</span>
															<input type="number" min={1} max={photoCount}
																value={ranges[key].start}
																onChange={ev => setRange(key, "start", ev.target.value)}
																placeholder="—"
																style={{ width: 42, margin: "0 3px", padding: "2px 4px", borderRadius: 6, border: "1.5px solid #e2e8f0", fontSize: "0.82rem", textAlign: "center" }}
															/>
															<span style={{ fontSize: "0.74rem", color: "#64748b" }}>张 到第</span>
															<input type="number" min={1} max={photoCount}
																value={ranges[key].end}
																onChange={ev => setRange(key, "end", ev.target.value)}
																placeholder="—"
																style={{ width: 42, margin: "0 3px", padding: "2px 4px", borderRadius: 6, border: "1.5px solid #e2e8f0", fontSize: "0.82rem", textAlign: "center" }}
															/>
															<span style={{ fontSize: "0.74rem", color: "#64748b" }}>张</span>
															{valid && (
																<span style={{ fontSize: "0.71rem", color: "#7c3aed", marginLeft: 5 }}>
																	{count}张·{count * CHARS_PER_PHOTO}字
																</span>
															)}
														</td>
													</tr>
												);
											})}
										</tbody>
									</table>
								</div>
							))}
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
							<div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
								<label style={{ fontWeight: 600, fontSize: "0.9rem" }}>
									口播稿 / Script
								</label>
								<span style={{ fontSize: "0.78rem", color: "#64748b" }}>
									{narrationDraft.length} 字 · 预计展示 ~{Math.min(50, estimatePhotos(narrationDraft))} 张照片
								</span>
							</div>
							{/* Per-section char count vs target — updates live as user types */}
							{(() => {
								const sections = narrationDraft.split(/---/).map(s => s.trim()).filter(Boolean);
								if (sections.length <= 1) return null;

								const us = upperStart    ? parseInt(upperStart,    10) : null;
								const bs = basementStart ? parseInt(basementStart, 10) : null;

								const rc = key => {
									const r = ranges[key];
									const s = r?.start ? parseInt(r.start, 10) : null;
									const e = r?.end   ? parseInt(r.end,   10) : null;
									return (s && e && e >= s) ? { s, e, n: e - s + 1 } : null;
								};

								const getFloorInfo = label => {
									const isMain     = ["主层", "室外及主层", "主层及室外"].includes(label);
									const isUpper    = label === "上层";
									const isBasement = label === "地下室";

									const sumRooms = keys => {
										const filled = keys.map(rc).filter(Boolean);
										if (!filled.length) return null;
										return {
											n:    filled.reduce((a, b) => a + b.n, 0),
											from: Math.min(...filled.map(x => x.s)),
											to:   Math.max(...filled.map(x => x.e)),
										};
									};

									if (isMain) {
										const r = sumRooms(["exterior", "living", "kitchen", "main_other"]);
										if (r) return { from: r.from, to: r.to, target: r.n * CHARS_PER_PHOTO };
										if (us) return { from: 1, to: us - 1, target: (us - 1) * CHARS_PER_PHOTO };
										return null;
									}
									if (isUpper) {
										const r = sumRooms(["master_suite", "upper_other"]);
										if (r) return { from: r.from, to: r.to, target: r.n * CHARS_PER_PHOTO };
										if (us && bs) return { from: us, to: bs - 1, target: (bs - us) * CHARS_PER_PHOTO };
										if (us) return { from: us, to: photoCount, target: (photoCount - us + 1) * CHARS_PER_PHOTO };
										return null;
									}
									if (isBasement) {
										const r = sumRooms(["basement", "other"]);
										if (r) return { from: r.from, to: r.to, target: r.n * CHARS_PER_PHOTO };
										if (bs) return { from: bs, to: photoCount, target: (photoCount - bs + 1) * CHARS_PER_PHOTO };
										return null;
									}
									return null;
								};

								return (
									<div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 10 }}>
										{sections.map((sec, i) => {
											const m = sec.match(/【([^】]+)】/);
											const label    = m ? m[1] : `段${i + 1}`;
											const bodyText = sec.replace(/^【[^】]*】\s*/, '').trim();
											const chars    = bodyText.length;
											const info     = getFloorInfo(label);
											const target   = info?.target ?? null;
											const tooShort = target != null && chars < target * 0.8;
											const tooLong  = target != null && chars > target * 1.3;
											const ok       = !tooShort && !tooLong;
											return (
												<div key={i} style={{
													display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8,
													fontSize: "0.78rem",
													background: tooShort ? "#fff7ed" : tooLong ? "#fef2f2" : "#f0fdf4",
													border: `1px solid ${tooShort ? "#fed7aa" : tooLong ? "#fecaca" : "#bbf7d0"}`,
													borderRadius: 8, padding: "5px 12px",
												}}>
													<span style={{ fontWeight: 700, color: "#334155" }}>【{label}】</span>
													{info && (
														<span style={{ color: "#64748b", fontSize: "0.73rem" }}>
															第{info.from}–{info.to}张 · 目标{info.target}字
														</span>
													)}
													<span style={{ fontWeight: 600, color: tooShort ? "#c2410c" : tooLong ? "#dc2626" : "#16a34a" }}>
														已写{chars}字
														{tooShort && ` ↑ 还差约${info.target - chars}字`}
														{tooLong  && ` ↓ 超出约${chars - info.target}字`}
														{ok && target != null && " ✓"}
													</span>
												</div>
											);
										})}
									</div>
								);
							})()}
							<p style={{ color: "#64748b", fontSize: "0.75rem", margin: "0 0 8px" }}>
								可直接编辑。用 --- 分隔各段，每段独立配音。标记变橙色 = 字数不足（补内容），变红色 = 字数超出（删减），绿色 = 刚好匹配。
							</p>
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
						</div>
						{errorMsg && (
							<div style={{ color: "#dc2626", fontSize: "0.85rem", marginBottom: 10 }}>{errorMsg}</div>
						)}
						<div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
							<button className="btn btn-bl" type="button" onClick={() => { setPhase("input"); setErrorMsg(""); }}>
								← 返回
							</button>
							<button className="btn" type="button" onClick={startGeneration}
								disabled={!narrationDraft.trim()}>
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
