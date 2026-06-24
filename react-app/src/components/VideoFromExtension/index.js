import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import apiFetch from "../../utils/apiFetch";
import XHSVideoModal from "../Appointments/MyListings/XHSVideoModal";

const fmtPrice = (p) => p ? `$${Number(p).toLocaleString("en-CA")}` : "";

const VideoFromExtension = () => {
	const location = useLocation();
	const agent = useSelector((s) => s.session.user);
	const [listings, setListings] = useState([]);
	const [loading, setLoading] = useState(true);
	const [selected, setSelected] = useState(null); // listing object
	const [showModal, setShowModal] = useState(false);
	const [videos, setVideos] = useState({});

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
		<div style={{ maxWidth: 680, margin: "0 auto", padding: "24px 16px" }}>
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
						disabled={!agent?.has_voice}
						title={!agent?.has_voice ? "请先在 My Profile 录制声音样本" : ""}
					>
						{existingVideo ? "重新生成视频" : "生成小红书看房视频"}
					</button>
					{!agent?.has_voice && (
						<span style={{ color: "#94a3b8", fontSize: "0.8rem", alignSelf: "center" }}>
							请先在 My Profile 录制声音样本
						</span>
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
