import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

// Phone-friendly "save to photos" page linked from the video-ready email.
// Browsers can't write to the photo library directly; the closest is the
// system share sheet (iPhone: 「存储视频」/ Save Video). The file is fetched as
// soon as the page opens, so tapping the button opens the share sheet
// immediately (iOS rejects share() if it isn't right after a tap).

const API = process.env.REACT_APP_API_URL || "";
const isOurMedia = (u) => {
	try {
		const h = new URL(u).hostname;
		return h === "media.tourit.ca" || h.endsWith(".r2.dev") || h.endsWith(".r2.cloudflarestorage.com");
	} catch {
		return false;
	}
};
const proxied = (u, name) => `${API}/api/xhs/download?url=${encodeURIComponent(u)}&name=${encodeURIComponent(name)}`;

function SaveButton({ url, name, type, label }) {
	const [file, setFile] = useState(null);
	const [state, setState] = useState("loading"); // loading | ready | saved | error
	const started = useRef(false);

	useEffect(() => {
		if (started.current) return;
		started.current = true;
		fetch(proxied(url, name))
			.then((r) => { if (!r.ok) throw new Error(r.status); return r.blob(); })
			.then((b) => { setFile(new File([b], name, { type })); setState("ready"); })
			.catch(() => setState("error"));
	}, [url, name, type]);

	const canShareFile = file && navigator.canShare && navigator.canShare({ files: [file] });

	const onClick = async () => {
		if (canShareFile) {
			try {
				await navigator.share({ files: [file] });
				setState("saved");
				return;
			} catch (e) {
				if (e && e.name === "AbortError") return;   // user closed the sheet
			}
		}
		window.location.href = proxied(url, name);       // Android / desktop: plain download
	};

	const busy = state === "loading";
	return (
		<button type="button" onClick={onClick} disabled={busy} style={{
			width: "100%", padding: "16px", borderRadius: 14, border: "none",
			background: busy ? "#94a3b8" : "#16a34a", color: "#fff",
			fontSize: "1.05rem", fontWeight: 700, marginBottom: 10, cursor: busy ? "default" : "pointer",
		}}>
			{busy ? "正在准备…" : state === "saved" ? "✓ 已打开保存选项" : state === "error" ? `⬇️ 下载${label}` : `📲 保存${label}到相册`}
		</button>
	);
}

export default function SaveVideo() {
	const q = new URLSearchParams(useLocation().search);
	const video = q.get("v") || "";
	const cover = q.get("c") || "";
	const title = q.get("t") || "看房视频";

	if (!isOurMedia(video)) {
		return <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>链接无效 / Invalid link</div>;
	}
	const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

	return (
		<div translate="no" style={{ maxWidth: 440, margin: "0 auto", padding: "20px 16px 40px" }}>
			<h2 style={{ fontSize: "1.15rem", fontWeight: 800, margin: "0 0 4px", color: "#0f172a" }}>🎬 {title}</h2>
			<p style={{ color: "#64748b", fontSize: "0.85rem", margin: "0 0 14px" }}>
				{isIOS ? "点下方按钮，在弹出的菜单里选「存储视频」即可保存到相册。" : "点下方按钮保存到手机。"}
			</p>
			<video src={video} controls playsInline style={{ width: "100%", borderRadius: 12, background: "#000", marginBottom: 14 }} />
			<SaveButton url={video} name="tourit-video.mp4" type="video/mp4" label="视频" />
			{isOurMedia(cover) && (
				<>
					<img src={cover} alt="cover" style={{ width: "100%", borderRadius: 12, margin: "10px 0 14px" }} />
					<SaveButton url={cover} name="tourit-cover.jpg" type="image/jpeg" label="封面" />
				</>
			)}
			<p style={{ color: "#94a3b8", fontSize: "0.75rem", marginTop: 12 }}>链接 7 天内有效 · Link valid for 7 days</p>
		</div>
	);
}
