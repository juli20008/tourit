import { useState, useEffect } from "react";
import { useSelector } from "react-redux";
import apiFetch from "../../../utils/apiFetch";
import XHSVideoModal from "./XHSVideoModal";

const fmtPrice = (p) =>
	p ? `$${Number(p).toLocaleString("en-CA")}` : "—";

const daysLeft = (expiresAt) => {
	const diff = new Date(expiresAt) - Date.now();
	return Math.max(0, Math.ceil(diff / 86400000));
};

const ListingCard = ({ listing, existingVideo, onVideoGenerated }) => {
	const [showModal, setShowModal] = useState(false);
	const agent = useSelector((state) => state.session.user);

	return (
		<div className="appt-card" style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
			{listing.front_img && (
				<img
					src={listing.front_img}
					alt="listing"
					style={{ width: 80, height: 60, objectFit: "cover", borderRadius: 6, flexShrink: 0 }}
				/>
			)}
			<div style={{ flex: 1, minWidth: 0 }}>
				<div style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: 2 }}>
					{listing.street || listing.address || listing.mls_number}
					{listing.unit ? ` #${listing.unit}` : ""}
				</div>
				<div style={{ color: "#64748b", fontSize: "0.8rem", marginBottom: 8 }}>
					{[listing.city, listing.state].filter(Boolean).join(", ")}
					{listing.price ? ` · ${fmtPrice(listing.price)}` : ""}
					{listing.bed ? ` · ${listing.bed}bd` : ""}
					{listing.bath ? ` ${listing.bath}ba` : ""}
				</div>

				{existingVideo && (
					<div style={{
						background: "#f0fdf4",
						border: "1px solid #bbf7d0",
						borderRadius: 8,
						padding: "8px 12px",
						marginBottom: 8,
						display: "flex",
						alignItems: "center",
						gap: 10,
						flexWrap: "wrap",
					}}>
						<span style={{ color: "#16a34a", fontSize: "0.8rem" }}>
							✓ 视频保存中 · 剩余 {daysLeft(existingVideo.expires_at)} 天
						</span>
						<a
							href={existingVideo.video_url}
							download
							className="btn btn-sm"
							style={{ fontSize: "0.75rem", textDecoration: "none" }}
						>
							下载
						</a>
					</div>
				)}

				<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
					<button
						className="btn btn-sm"
						style={{ fontSize: "0.78rem" }}
						onClick={() => setShowModal(true)}
						disabled={!agent?.has_voice}
						title={
							!agent?.has_voice
								? "请先在「My Profile」录制声音样本"
								: ""
						}
					>
						{existingVideo ? "重新生成" : "生成小红书看房视频"}
					</button>
					{!agent?.has_voice && (
						<span style={{ color: "#94a3b8", fontSize: "0.75rem", alignSelf: "center" }}>
							请先录制声音样本
						</span>
					)}
				</div>
			</div>

			{showModal && (
				<XHSVideoModal
					listing={listing}
					onClose={() => setShowModal(false)}
					onGenerated={(v) => { onVideoGenerated?.(listing.mls_number || listing.listing_id, v); }}
				/>
			)}
		</div>
	);
};

const MyListings = () => {
	const appointments = useSelector((state) => state.appointments);
	const properties = useSelector((state) => state.properties);
	const [videos, setVideos] = useState({}); // mls_number → video record
	const [loadingVideos, setLoadingVideos] = useState(true);

	const handleVideoGenerated = (mlsNumber, video) => {
		setVideos((prev) => ({ ...prev, [mlsNumber]: { ...video, mls_number: mlsNumber } }));
	};

	// Collect unique properties from agent's appointments
	const seen = new Set();
	const listings = [];
	Object.values(appointments || {}).forEach((appt) => {
		const propId = appt.property_id;
		if (propId && !seen.has(propId) && properties[propId]) {
			seen.add(propId);
			listings.push(properties[propId]);
		}
	});

	useEffect(() => {
		apiFetch("/api/xhs/agent/videos")
			.then((r) => r.ok ? r.json() : [])
			.then((rows) => {
				const map = {};
				rows.forEach((v) => { map[v.mls_number] = v; });
				setVideos(map);
			})
			.catch(() => {})
			.finally(() => setLoadingVideos(false));
	}, []);

	if (listings.length === 0) {
		return (
			<div style={{ color: "#94a3b8", padding: "24px 0", textAlign: "center", fontSize: "0.875rem" }}>
				暂无关联房源。当您为客户预约看房后，相关房源将显示在这里。
				<br />
				No listings yet. Properties from your appointments will appear here.
			</div>
		);
	}

	return (
		<div className="appt-card-list">
			{listings.map((listing) => {
				const mlsNum = listing.mls_number || listing.listing_id;
				return (
					<ListingCard
						key={listing.id || mlsNum}
						listing={listing}
						existingVideo={videos[mlsNum] || null}
						onVideoGenerated={handleVideoGenerated}
					/>
				);
			})}
		</div>
	);
};

export default MyListings;
