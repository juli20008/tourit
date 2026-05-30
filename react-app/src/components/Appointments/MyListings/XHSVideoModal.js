import { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import apiFetch from "../../../utils/apiFetch";

const POLL_MS = 2500;

const STEP_LABELS = {
	"Starting...": "正在启动...",
	"Loading listing...": "加载房源...",
	"Downloading photos...": "下载图片...",
	"Creating cover slide...": "生成封面...",
	"Writing narration...": "撰写口播文案...",
	"Generating voiceover...": "生成AI配音...",
	"Rendering video...": "渲染视频...",
	"Mixing audio...": "混合音频...",
	"Uploading...": "上传视频...",
};

const XHSVideoModal = ({ listing, onClose, onGenerated }) => {
	const [cover1, setCover1] = useState("");
	const [cover2, setCover2] = useState("");
	const [cover3, setCover3] = useState("");
	const [phase, setPhase] = useState("input"); // "input" | "generating" | "done" | "error"
	const [step, setStep] = useState("");
	const [videoUrl, setVideoUrl] = useState(null);
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
		const resp = await apiFetch(`/api/xhs/agent/video/${mlsNumber}`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ cover1, cover2, cover3 }),
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

				if (status.step) {
					setStep(STEP_LABELS[status.step] || status.step);
				}

				if (status.status === "done") {
					clearInterval(pollRef.current);
					setVideoUrl(status.url);
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
					padding: "32px 28px",
					boxShadow: "0 8px 40px rgba(0,0,0,.18)",
				}}
				onClick={(e) => e.stopPropagation()}
			>
				<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
					<h3 style={{ margin: 0, fontSize: "1.1rem" }}>生成小红书看房视频</h3>
					<button
						className="btn btn-sm btn-bl"
						onClick={onClose}
						style={{ padding: "4px 10px" }}
					>
						✕
					</button>
				</div>

				<div style={{ color: "#64748b", fontSize: "0.85rem", marginBottom: 20 }}>
					{listing.street || listing.address}
					{listing.city ? `, ${listing.city}` : ""}
				</div>

				{phase === "input" && (
					<>
						<div style={{ marginBottom: 16 }}>
							<label style={{ display: "block", fontWeight: 600, marginBottom: 8, fontSize: "0.9rem" }}>
								封面文字 / Cover Text
							</label>
							<p style={{ color: "#64748b", fontSize: "0.8rem", marginTop: 0, marginBottom: 12 }}>
								视频封面将显示这三行文字，由您手动输入。
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

						{errorMsg && (
							<div style={{ color: "#dc2626", fontSize: "0.85rem", marginBottom: 12 }}>
								{errorMsg}
							</div>
						)}

						<div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
							<button className="btn btn-bl" type="button" onClick={onClose}>
								取消
							</button>
							<button className="btn" type="button" onClick={startGeneration}>
								生成视频 Generate
							</button>
						</div>
					</>
				)}

				{phase === "generating" && (
					<div style={{ textAlign: "center", padding: "24px 0" }}>
						<div style={{
					width: 36,
					height: 36,
					border: "3px solid #e2e8f0",
					borderTop: "3px solid #3b82f6",
					borderRadius: "50%",
					animation: "xhs-spin 0.8s linear infinite",
					margin: "0 auto 16px",
				}} />
						<p style={{ color: "#334155", fontWeight: 600 }}>正在生成视频，请稍候...</p>
						<p style={{ color: "#64748b", fontSize: "0.85rem" }}>{step}</p>
						<p style={{ color: "#94a3b8", fontSize: "0.78rem", marginTop: 8 }}>
							通常需要 30–90 秒，请不要关闭此窗口。
						</p>
					</div>
				)}

				{phase === "done" && videoUrl && (
					<div style={{ textAlign: "center", padding: "16px 0" }}>
						<div style={{ color: "#16a34a", fontSize: "1.5rem", marginBottom: 12 }}>✓</div>
						<p style={{ fontWeight: 600, marginBottom: 16 }}>视频已生成！/ Video ready!</p>
						<video
							src={videoUrl}
							controls
							style={{ width: "100%", borderRadius: 8, marginBottom: 16 }}
						/>
						<a
							href={videoUrl}
							download
							className="btn"
							style={{ display: "inline-block", textDecoration: "none" }}
						>
							下载视频 Download
						</a>
					</div>
				)}

				{phase === "error" && (
					<div style={{ textAlign: "center", padding: "16px 0" }}>
						<div style={{ color: "#dc2626", fontSize: "1.5rem", marginBottom: 12 }}>✗</div>
						<p style={{ color: "#dc2626", fontWeight: 600, marginBottom: 8 }}>生成失败 / Failed</p>
						<p style={{ color: "#64748b", fontSize: "0.875rem", marginBottom: 16 }}>{errorMsg}</p>
						<button className="btn" onClick={() => { setPhase("input"); setErrorMsg(""); }}>
							重试 Retry
						</button>
					</div>
				)}
			</div>
		</div>
	);

	return ReactDOM.createPortal(modal, document.body);

};

export default XHSVideoModal;
