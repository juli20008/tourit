import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import apiFetch from "../../utils/apiFetch";
import XHSVideoModal from "../Appointments/MyListings/XHSVideoModal";

// Pipeline step → [Chinese label, approx. % done]
const STEP_INFO = {
	"Starting...":             ["正在启动...", 5],
	"Loading listing...":      ["加载房源...", 10],
	"Downloading photos...":   ["下载图片...", 20],
	"Creating cover...":       ["生成封面...", 28],
	"Classifying photos...":   ["分析照片...", 33],
	"Writing narration...":    ["撰写口播文案...", 40],
	"Generating voiceover...": ["生成AI配音...", 50],
	"Rendering video...":      ["渲染视频...", 65],
	"Mixing audio...":         ["混合音频...", 85],
	"Rendering final video...":["合成视频...", 92],
	"Uploading...":            ["上传视频...", 97],
};
const stepLabel = (step) => (STEP_INFO[step] || [])[0] || (step ? step : "排队中，等待开始...");
const stepPct = (step) => (STEP_INFO[step] || [])[1] || 2;
const fmtElapsed = (iso) => {
	const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
	return `${Math.floor(s / 60)}分${String(s % 60).padStart(2, "0")}秒`;
};

const fmtPrice = (p) => p ? `$${Number(p).toLocaleString("en-CA")}` : "";

const VideoFromExtension = () => {
	const location = useLocation();
	const agent = useSelector((s) => s.session.user);
	const [listings, setListings] = useState([]);
	const [loading, setLoading] = useState(true);
	const [selected, setSelected] = useState(null); // listing object
	const [showModal, setShowModal] = useState(false);
	const [videos, setVideos] = useState({});
	// Quick video job: { mls, status: "generating" | "done" | "error", step, url, message }
	const [quickJob, setQuickJob] = useState(null);
	const quickPollRef = useRef(null);

	useEffect(() => () => clearInterval(quickPollRef.current), []);

	const preselectedMls = new URLSearchParams(location.search).get("mls");

	// Load recently pushed listings
	useEffect(() => {
		apiFetch("/api/scrape/recent")
			.then((r) => r.ok ? r.json() : { listings: [] })
			.then(({ listings: rows }) => {
				setListings(rows);
				if (rows.length > 0) {
					const pre = preselectedMls
						? rows.find((r) => r.mls_number === preselectedMls)
						: null;
					setSelected(pre || rows[0]);
				}
			})
			.catch(() => {})
			.finally(() => setLoading(false));
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	// Load existing videos
	useEffect(() => {
		apiFetch("/api/xhs/agent/videos")
			.then((r) => r.ok ? r.json() : [])
			.then((rows) => {
				const map = {};
				rows.forEach((v) => { map[v.mls_number] = v; });
				setVideos(map);
			})
			.catch(() => {});
	}, []);

	const handleSelect = (e) => {
		const mls = e.target.value;
		setSelected(listings.find((r) => r.mls_number === mls) || null);
		setShowModal(false);
	};

	// Follow a job until it finishes; works for jobs started here, by the
	// extension's auto-start, or in another tab.
	const pollJob = (jobId, mls, startedAt) => {
		clearInterval(quickPollRef.current);
		setQuickJob((prev) => ({ mls, status: "generating", stepKey: prev?.mls === mls ? prev.stepKey : "", startedAt, jobId }));
		const tick = async () => {
			try {
				const sr = await apiFetch(`/api/xhs/agent/video/status/${jobId}`);
				if (!sr.ok) return;
				const st = await sr.json();
				if (st.status === "done") {
					clearInterval(quickPollRef.current);
					setQuickJob({ mls, status: "done", url: st.url });
					setVideos((prev) => ({ ...prev, [mls]: { url: st.url, video_url: st.url, expires_at: st.expires_at, mls_number: mls } }));
					setActiveJobs((prev) => { const n = { ...prev }; delete n[mls]; return n; });
				} else if (st.status === "error") {
					clearInterval(quickPollRef.current);
					setQuickJob({ mls, status: "error", message: st.message || "Generation failed" });
					setActiveJobs((prev) => { const n = { ...prev }; delete n[mls]; return n; });
				} else {
					setQuickJob((prev) => (prev && prev.mls === mls ? { ...prev, stepKey: st.step || prev.stepKey } : prev));
				}
			} catch {
				// network hiccup, keep polling
			}
		};
		tick();
		quickPollRef.current = setInterval(tick, 2500);
	};

	const startQuickVideo = async (lang) => {
		const mls = selected.mls_number;
		clearInterval(quickPollRef.current);
		const startedAt = new Date().toISOString();
		setQuickJob({ mls, lang, status: "generating", stepKey: "Starting...", startedAt });

		const formData = new FormData();
		formData.append("quick", "1");
		formData.append("lang", lang);
		formData.append("motion_style", "classic");
		formData.append("photo_count", (selected.images || []).length || 30);

		try {
			const resp = await apiFetch(`/api/xhs/agent/video/${mls}`, { method: "POST", body: formData });
			const d = await resp.json().catch(() => ({}));
			if (resp.status === 409 && d.job_id) {
				// Already generating (e.g. auto-started from the extension) → just show its progress
				const running = activeJobs[mls];
				pollJob(d.job_id, mls, running?.created_at || startedAt);
				return;
			}
			if (!resp.ok) {
				setQuickJob({ mls, status: "error", message: d.error || `Error ${resp.status}` });
				return;
			}
			setActiveJobs((prev) => ({ ...prev, [mls]: { job_id: d.job_id, mls_number: mls, created_at: startedAt } }));
			pollJob(d.job_id, mls, startedAt);
		} catch (e) {
			setQuickJob({ mls, status: "error", message: String(e) });
		}
	};

	// Videos already generating for this agent (any tab / the extension).
	const [activeJobs, setActiveJobs] = useState({});
	useEffect(() => {
		const load = () => apiFetch("/api/xhs/agent/video/active")
			.then((r) => (r.ok ? r.json() : { jobs: [] }))
			.then(({ jobs }) => {
				const map = {};
				(jobs || []).forEach((j) => { if (!map[j.mls_number]) map[j.mls_number] = j; });
				setActiveJobs(map);
			})
			.catch(() => {});
		load();
		const t = setInterval(load, 10000);
		return () => clearInterval(t);
	}, []);

	// When the selected listing has a video generating, show its live progress.
	useEffect(() => {
		if (!selected) return;
		const job = activeJobs[selected.mls_number];
		if (job && !(quickJob && quickJob.mls === selected.mls_number && quickJob.status === "generating")) {
			pollJob(job.job_id, selected.mls_number, job.created_at);
		}
	}, [selected, activeJobs]); // eslint-disable-line react-hooks/exhaustive-deps

	// ?autoquick=zh|en (set by the Chrome extension after pushing a listing):
	// start the quick video for that listing once, then drop the param so a
	// page refresh doesn't generate a second video.
	const autoQuick = new URLSearchParams(location.search).get("autoquick");
	const autoStartedRef = useRef(false);
	useEffect(() => {
		if (autoStartedRef.current || !autoQuick || !selected || !agent?.has_voice) return;
		if (activeJobs[selected.mls_number]) { autoStartedRef.current = true; return; }  // already running
		if (selected.mls_number !== preselectedMls) return;
		autoStartedRef.current = true;
		window.history.replaceState(null, "", `${location.pathname}?mls=${encodeURIComponent(preselectedMls)}`);
		startQuickVideo(autoQuick === "en" ? "en" : "zh");
	}, [selected, agent]); // eslint-disable-line react-hooks/exhaustive-deps

	const quickForSelected = quickJob && selected && quickJob.mls === selected.mls_number ? quickJob : null;
	// Disable generate buttons while this listing has a video in progress
	const quickGenerating = quickForSelected?.status === "generating" || (selected && !!activeJobs[selected.mls_number]);

	const existingVideo = selected ? videos[selected.mls_number] : null;
	const daysLeft = existingVideo
		? Math.max(0, Math.ceil((new Date(existingVideo.expires_at) - Date.now()) / 86400000))
		: 0;

	if (loading) {
		return <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>加载中…</div>;
	}

	if (listings.length === 0) {
		return (
			<div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>
				<p style={{ fontSize: "0.95rem", marginBottom: 12 }}>
					暂无房源。请从 Chrome 扩展程序推送 Realm 房源。
				</p>
				<p style={{ fontSize: "0.8rem", color: "#94a3b8" }}>
					No listings yet. Push a Realm listing from the Chrome extension first.
				</p>
			</div>
		);
	}

	return (
		<div style={{ maxWidth: 680, margin: "0 auto", padding: "24px 16px" }} translate="no">
			<h2 style={{ fontSize: "1.15rem", fontWeight: 700, marginBottom: 20, color: "#1e293b" }}>
				看房视频制作 / Video Studio
			</h2>

			{/* Listing selector */}
			<div style={{ marginBottom: 20 }}>
				<label style={{ display: "block", fontSize: "0.82rem", color: "#64748b", marginBottom: 6 }}>
					选择房源 / Select Listing
				</label>
				<select
					value={selected?.mls_number || ""}
					onChange={handleSelect}
					style={{
						width: "100%",
						padding: "10px 12px",
						borderRadius: 8,
						border: "1.5px solid #e2e8f0",
						fontSize: "0.9rem",
						color: "#1e293b",
						background: "#fff",
						outline: "none",
						cursor: "pointer",
					}}
				>
					{listings.map((r) => (
						<option key={r.mls_number} value={r.mls_number}>
							{r.street || r.mls_number}
							{r.city ? ` · ${r.city}` : ""}
							{r.price ? ` · ${fmtPrice(r.price)}` : ""}
							{activeJobs[r.mls_number] ? " · ⏳ 视频生成中" : ""}
						</option>
					))}
				</select>
			</div>

			{/* Selected listing card */}
			{selected && (
				<div style={{
					background: "#f8fafc",
					border: "1px solid #e2e8f0",
					borderRadius: 12,
					padding: 16,
					marginBottom: 20,
					display: "flex",
					gap: 14,
					alignItems: "flex-start",
				}}>
					{selected.front_img && (
						<img
							src={selected.front_img}
							alt=""
							style={{ width: 90, height: 68, objectFit: "cover", borderRadius: 8, flexShrink: 0 }}
						/>
					)}
					<div style={{ flex: 1, minWidth: 0 }}>
						<div style={{ fontWeight: 600, fontSize: "0.95rem", marginBottom: 4 }} translate="no">
							{selected.street || selected.mls_number}
						</div>
						<div style={{ color: "#64748b", fontSize: "0.82rem", marginBottom: 4 }} translate="no">
							{selected.city || ""}
							{selected.price ? ` · ${fmtPrice(selected.price)}` : ""}
						</div>
						<div style={{ color: "#64748b", fontSize: "0.82rem" }}>
							{selected.bed ? `${selected.bed} bd` : ""}
							{selected.beds_above_grade != null ? ` (${selected.beds_above_grade}上` : ""}
							{selected.basement_beds != null ? `+${selected.basement_beds}下)` : selected.beds_above_grade != null ? ")" : ""}
							{selected.bath ? ` · ${selected.bath} ba` : ""}
							{selected.sqft ? ` · ${selected.sqft} sqft` : ""}
						</div>

						{/* Existing video badge */}
						{existingVideo && (
							<div style={{
								marginTop: 8,
								background: "#f0fdf4",
								border: "1px solid #bbf7d0",
								borderRadius: 6,
								padding: "6px 10px",
								display: "flex",
								alignItems: "center",
								gap: 10,
								flexWrap: "wrap",
							}}>
								<span style={{ color: "#16a34a", fontSize: "0.78rem" }}>
									✓ 视频保存中 · 剩余 {daysLeft} 天
								</span>
								<a
									href={`${process.env.REACT_APP_API_URL || ''}/api/xhs/download?url=${encodeURIComponent(existingVideo.video_url)}&name=video.mp4`}
									className="btn btn-sm"
									style={{ fontSize: "0.73rem", textDecoration: "none" }}
								>
									下载
								</a>
							</div>
						)}
					</div>
				</div>
			)}

			{/* Generate button */}
			{selected && (
				<div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
					<button
						className="btn"
						style={{ fontSize: "0.88rem" }}
						onClick={() => setShowModal(true)}
						disabled={!agent?.has_voice || quickGenerating}
						title={!agent?.has_voice ? "请先在 My Profile 录制声音样本" : ""}
					>
						{existingVideo ? "重新生成视频" : "生成小红书看房视频"}
					</button>
					{[
						["zh", "⚡ 快速生成 · 中文语音", "中文配音：社区、面积、卧室、洗手间 + Client Remarks（自动翻译成中文）"],
						["en", "⚡ 快速生成 · English", "English voiceover: community, size, beds, baths + Client Remarks"],
					].map(([lang, label, tip]) => (
						<button
							key={lang}
							className="btn"
							style={{ fontSize: "0.88rem", background: "#7c3aed", borderColor: "#7c3aed" }}
							onClick={() => startQuickVideo(lang)}
							disabled={!agent?.has_voice || quickGenerating}
							title={tip}
						>
							{quickGenerating ? "生成中..." : label}
						</button>
					))}
					{!agent?.has_voice && (
						<span style={{ color: "#94a3b8", fontSize: "0.8rem", alignSelf: "center" }}>
							请先在 My Profile 录制声音样本
						</span>
					)}
				</div>
			)}

			{quickForSelected && (
				<div style={{ marginTop: 16, fontSize: "0.85rem" }}>
					{quickForSelected.status === "generating" && (
						<div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 8, padding: "12px 14px", color: "#0369a1" }}>
							<div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600, marginBottom: 6 }}>
								<span>⏳ 视频生成中：{stepLabel(quickForSelected.stepKey)}</span>
								<span>{stepPct(quickForSelected.stepKey)}%</span>
							</div>
							<div style={{ height: 8, background: "#dbeafe", borderRadius: 999, overflow: "hidden" }}>
								<div style={{ width: `${stepPct(quickForSelected.stepKey)}%`, height: "100%", background: "#2563eb", borderRadius: 999, transition: "width .6s ease" }} />
							</div>
							<div style={{ fontSize: "0.78rem", marginTop: 6, color: "#0369a1" }}>
								{quickForSelected.startedAt ? `已用时 ${fmtElapsed(quickForSelected.startedAt)} · ` : ""}一般 2–5 分钟。可以离开此页面，完成后会发邮件通知您。
							</div>
						</div>
					)}
					{quickForSelected.status === "done" && quickForSelected.url && (
						<div>
							<video src={quickForSelected.url} controls style={{ width: "100%", maxWidth: 320, borderRadius: 8, display: "block", marginBottom: 10 }} />
							<a
								href={`${process.env.REACT_APP_API_URL || ''}/api/xhs/download?url=${encodeURIComponent(quickForSelected.url)}&name=video.mp4`}
								className="btn"
								style={{ textDecoration: "none", display: "inline-block" }}
							>
								下载视频 Download Video
							</a>
						</div>
					)}
					{quickForSelected.status === "error" && (
						<div style={{ color: "#dc2626" }}>快速生成失败：{quickForSelected.message}</div>
					)}
				</div>
			)}

			{showModal && selected && (
				<XHSVideoModal
					listing={selected}
					onClose={() => setShowModal(false)}
					onGenerated={(v) => {
						setVideos((prev) => ({ ...prev, [selected.mls_number]: { ...v, mls_number: selected.mls_number } }));
					}}
				/>
			)}
		</div>
	);
};

export default VideoFromExtension;
