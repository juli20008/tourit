import { useState, useRef } from "react";
import { useDispatch } from "react-redux";
import * as sessionActions from "../../../store/session";
import apiFetch from "../../../utils/apiFetch";

const ACCEPTED = ".mp3,.wav,.m4a,.aac,.ogg";

const BgMusicUpload = ({ bgMusicUrl }) => {
	const dispatch = useDispatch();
	const fileRef = useRef(null);

	const [uploading, setUploading] = useState(false);
	const [status, setStatus] = useState(null); // "saved" | "error"
	const [errorMsg, setErrorMsg] = useState("");
	const [preview, setPreview] = useState(bgMusicUrl || null);

	const handleFile = async (e) => {
		const file = e.target.files?.[0];
		if (!file) return;

		const maxMB = 20;
		if (file.size > maxMB * 1024 * 1024) {
			setStatus("error");
			setErrorMsg(`文件不能超过 ${maxMB}MB`);
			return;
		}

		setUploading(true);
		setStatus(null);
		setErrorMsg("");

		try {
			const form = new FormData();
			form.append("music", file);
			const resp = await apiFetch("/api/xhs/agent/bg-music", {
				method: "POST",
				body: form,
			});
			const data = await resp.json();
			if (!resp.ok) throw new Error(data.error || "上传失败");
			setPreview(data.bg_music_url);
			setStatus("saved");
			dispatch(sessionActions.authenticate());
		} catch (err) {
			setStatus("error");
			setErrorMsg(err.message);
		} finally {
			setUploading(false);
			if (fileRef.current) fileRef.current.value = "";
		}
	};

	const handleDelete = async () => {
		if (!window.confirm("删除背景音乐？")) return;
		setUploading(true);
		try {
			await apiFetch("/api/xhs/agent/bg-music", { method: "DELETE" });
			setPreview(null);
			setStatus(null);
			dispatch(sessionActions.authenticate());
		} catch {
			// ignore
		} finally {
			setUploading(false);
		}
	};

	return (
		<div className="voice-recorder" style={{ marginTop: 24 }}>
			<h4 style={{ marginBottom: 8 }}>视频背景音乐</h4>
			<p style={{ fontSize: 13, color: "#888", marginBottom: 12 }}>
				上传后每个看房视频都会在背景播放这段音乐（音量自动调低，不盖过人声）
			</p>

			{preview ? (
				<div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
					<audio controls src={preview} style={{ height: 36, maxWidth: 260 }} />
					<button
						type="button"
						className="btn btn-sm"
						style={{ background: "#dc2626", color: "#fff", border: "none", borderRadius: 6, padding: "4px 12px", cursor: "pointer" }}
						onClick={handleDelete}
						disabled={uploading}
					>
						删除
					</button>
				</div>
			) : (
				<p style={{ fontSize: 13, color: "#aaa", marginBottom: 12 }}>暂无背景音乐</p>
			)}

			<input
				ref={fileRef}
				type="file"
				accept={ACCEPTED}
				style={{ display: "none" }}
				onChange={handleFile}
			/>
			<button
				type="button"
				className="btn"
				onClick={() => fileRef.current?.click()}
				disabled={uploading}
			>
				{uploading ? "上传中..." : preview ? "更换音乐" : "上传音乐"}
			</button>

			{status === "saved" && (
				<p style={{ color: "#16a34a", fontSize: 13, marginTop: 8 }}>已保存</p>
			)}
			{status === "error" && (
				<p style={{ color: "#dc2626", fontSize: 13, marginTop: 8 }}>{errorMsg}</p>
			)}
		</div>
	);
};

export default BgMusicUpload;
