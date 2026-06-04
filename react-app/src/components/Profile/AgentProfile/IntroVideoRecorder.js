import { useState, useRef, useEffect } from "react";
import { useDispatch } from "react-redux";
import * as sessionActions from "../../../store/session";

const MAX_SECONDS = 10;
const MAX_VIDEO_MB = 50;

const IntroVideoRecorder = ({ hasIntroVideo, introVideoUrl }) => {
	const dispatch = useDispatch();

	const [recording, setRecording] = useState(false);
	const [videoBlob, setVideoBlob] = useState(null);
	const [previewUrl, setPreviewUrl] = useState(null);
	const [timeLeft, setTimeLeft] = useState(MAX_SECONDS);
	const [uploading, setUploading] = useState(false);
	const [status, setStatus] = useState(null); // "saved" | "error"
	const fileInputRef = useRef(null);
	const [errorMsg, setErrorMsg] = useState("");

	const mediaRef = useRef(null);
	const streamRef = useRef(null);
	const chunksRef = useRef([]);
	const timerRef = useRef(null);
	const liveVideoRef = useRef(null);

	useEffect(() => {
		return () => {
			clearInterval(timerRef.current);
			if (mediaRef.current && mediaRef.current.state !== "inactive") {
				mediaRef.current.stop();
			}
			if (streamRef.current) {
				streamRef.current.getTracks().forEach((t) => t.stop());
			}
			if (previewUrl) URL.revokeObjectURL(previewUrl);
		};
	}, [previewUrl]);

	const startRecording = async () => {
		setStatus(null);
		setVideoBlob(null);
		setErrorMsg("");
		if (previewUrl) {
			URL.revokeObjectURL(previewUrl);
			setPreviewUrl(null);
		}
		setTimeLeft(MAX_SECONDS);
		chunksRef.current = [];

		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 1280 } },
				audio: true,
			});
			streamRef.current = stream;

			if (liveVideoRef.current) {
				liveVideoRef.current.srcObject = stream;
				liveVideoRef.current.play().catch(() => {});
			}

			const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
				? "video/webm;codecs=vp9,opus"
				: MediaRecorder.isTypeSupported("video/webm")
				? "video/webm"
				: "video/mp4";

			const recorder = new MediaRecorder(stream, { mimeType });
			mediaRef.current = recorder;

			recorder.ondataavailable = (e) => {
				if (e.data.size > 0) chunksRef.current.push(e.data);
			};

			recorder.onstop = () => {
				stream.getTracks().forEach((t) => t.stop());
				if (liveVideoRef.current) liveVideoRef.current.srcObject = null;
				const blob = new Blob(chunksRef.current, { type: mimeType });
				setVideoBlob(blob);
				setPreviewUrl(URL.createObjectURL(blob));
			};

			recorder.start();
			setRecording(true);

			timerRef.current = setInterval(() => {
				setTimeLeft((prev) => {
					if (prev <= 1) {
						stopRecording();
						return 0;
					}
					return prev - 1;
				});
			}, 1000);
		} catch (err) {
			setErrorMsg("摄像头/麦克风访问被拒绝 / Camera or microphone access denied.");
		}
	};

	const stopRecording = () => {
		clearInterval(timerRef.current);
		if (mediaRef.current && mediaRef.current.state !== "inactive") {
			mediaRef.current.stop();
		}
		setRecording(false);
	};

	const uploadVideo = async () => {
		if (!videoBlob) return;
		setUploading(true);
		setStatus(null);
		const result = await dispatch(sessionActions.uploadIntroVideo(videoBlob));
		setUploading(false);
		if (result?.error) {
			setErrorMsg(result.error);
			setStatus("error");
		} else {
			setStatus("saved");
			setVideoBlob(null);
			if (previewUrl) {
				URL.revokeObjectURL(previewUrl);
				setPreviewUrl(null);
			}
		}
	};

	const pickFile = (e) => {
		const file = e.target.files?.[0];
		if (!file) return;
		if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
			setErrorMsg(`视频过大，请控制在 ${MAX_VIDEO_MB}MB 以内 / Video must be under ${MAX_VIDEO_MB}MB`);
			setStatus("error");
			e.target.value = "";
			return;
		}
		setStatus(null);
		setErrorMsg("");
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		setVideoBlob(file);
		setPreviewUrl(URL.createObjectURL(file));
	};

	const deleteVideo = async () => {
		setUploading(true);
		await dispatch(sessionActions.deleteIntroVideo());
		setUploading(false);
		setVideoBlob(null);
		if (previewUrl) {
			URL.revokeObjectURL(previewUrl);
			setPreviewUrl(null);
		}
	};

	return (
		<div style={{ borderLeft: "4px solid #f59e0b", paddingLeft: 16, marginTop: 20 }}>
			<div className="gap15">
				<div className="about" style={{ color: "#b45309" }}>
					🎬 小红书开场视频 / Intro Video
				</div>
				<p style={{ color: "#64748b", fontSize: "0.875rem", margin: 0 }}>
					录制最多 10 秒竖屏自拍，将作为视频开场，封面文字会自动叠加。也可用美颜相机录好后从相册上传。
					<br />
					Record a 10s portrait selfie, or record with a beauty camera app and upload from gallery.
				</p>

				{recording && (
					<div style={{ position: "relative", width: "100%", maxWidth: 240, margin: "0 auto" }}>
						<video
							ref={liveVideoRef}
							muted
							playsInline
							style={{
								width: "100%",
								borderRadius: 12,
								border: "2px solid #f59e0b",
								aspectRatio: "9/16",
								objectFit: "cover",
								backgroundColor: "#000",
							}}
						/>
						<div
							style={{
								position: "absolute",
								top: 8,
								right: 10,
								background: "rgba(220,38,38,0.85)",
								color: "#fff",
								borderRadius: 20,
								padding: "2px 10px",
								fontSize: "0.8rem",
								fontWeight: 600,
							}}
						>
							● REC {timeLeft}s
						</div>
					</div>
				)}

				{previewUrl && !recording && (
					<video
						src={previewUrl}
						controls
						style={{
							width: "100%",
							maxWidth: 240,
							borderRadius: 12,
							display: "block",
							margin: "0 auto",
							aspectRatio: "9/16",
							objectFit: "cover",
							backgroundColor: "#000",
						}}
					/>
				)}

				{hasIntroVideo && !videoBlob && !recording && (
					<div style={{ color: "#16a34a", fontSize: "0.875rem" }}>
						✓ 已保存开场视频 / Intro video saved
					</div>
				)}

				<div className="service-area-btn-wrap" style={{ flexWrap: "wrap", gap: "8px" }}>
					{/* Hidden file input — accepts video from gallery / file system */}
					<input
						ref={fileInputRef}
						type="file"
						accept="video/*"
						style={{ display: "none" }}
						onChange={pickFile}
					/>

					{!recording ? (
						<button
							type="button"
							className="btn"
							onClick={startRecording}
							disabled={uploading}
						>
							● 开始录制 Record
						</button>
					) : (
						<button
							type="button"
							className="btn btn-bl"
							onClick={stopRecording}
						>
							■ 停止 Stop ({timeLeft}s)
						</button>
					)}

					{!recording && (
						<button
							type="button"
							className="btn"
							style={{ background: "#7c3aed", borderColor: "#7c3aed" }}
							onClick={() => fileInputRef.current?.click()}
							disabled={uploading}
						>
							📷 从相册上传 Upload
						</button>
					)}

					{videoBlob && !recording && (
						<button
							type="button"
							className="btn"
							onClick={uploadVideo}
							disabled={uploading}
						>
							{uploading ? "保存中..." : "保存视频 Save"}
						</button>
					)}

					{hasIntroVideo && !videoBlob && (
						<button
							type="button"
							className="btn btn-bl"
							onClick={deleteVideo}
							disabled={uploading}
						>
							删除 Delete
						</button>
					)}
				</div>

				{status === "saved" && (
					<div style={{ color: "#16a34a", fontSize: "0.875rem" }}>
						✓ 开场视频已保存！/ Intro video saved!
					</div>
				)}
				{(status === "error" || (!status && errorMsg)) && (
					<div style={{ color: "#dc2626", fontSize: "0.875rem" }}>{errorMsg}</div>
				)}
			</div>
		</div>
	);
};

export default IntroVideoRecorder;
