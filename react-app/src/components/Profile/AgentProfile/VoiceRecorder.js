import { useState, useRef, useEffect } from "react";
import { useDispatch } from "react-redux";
import * as sessionActions from "../../../store/session";

const MAX_SECONDS = 30;

const VoiceRecorder = ({ hasVoice, voiceSampleUrl }) => {
	const dispatch = useDispatch();

	const [recording, setRecording] = useState(false);
	const [audioBlob, setAudioBlob] = useState(null);
	const [audioUrl, setAudioUrl] = useState(null);
	const [timeLeft, setTimeLeft] = useState(MAX_SECONDS);
	const [uploading, setUploading] = useState(false);
	const [status, setStatus] = useState(null); // "saved" | "error"
	const [errorMsg, setErrorMsg] = useState("");

	const mediaRef = useRef(null);
	const chunksRef = useRef([]);
	const timerRef = useRef(null);

	useEffect(() => {
		return () => {
			clearInterval(timerRef.current);
			if (mediaRef.current && mediaRef.current.state !== "inactive") {
				mediaRef.current.stop();
			}
			if (audioUrl) URL.revokeObjectURL(audioUrl);
		};
	}, [audioUrl]);

	const startRecording = async () => {
		setStatus(null);
		setAudioBlob(null);
		if (audioUrl) {
			URL.revokeObjectURL(audioUrl);
			setAudioUrl(null);
		}
		setTimeLeft(MAX_SECONDS);
		chunksRef.current = [];

		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
				? "audio/webm;codecs=opus"
				: "audio/webm";
			const recorder = new MediaRecorder(stream, { mimeType });
			mediaRef.current = recorder;

			recorder.ondataavailable = (e) => {
				if (e.data.size > 0) chunksRef.current.push(e.data);
			};

			recorder.onstop = () => {
				stream.getTracks().forEach((t) => t.stop());
				const blob = new Blob(chunksRef.current, { type: mimeType });
				setAudioBlob(blob);
				setAudioUrl(URL.createObjectURL(blob));
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
			setErrorMsg("Microphone access denied. Please allow microphone permissions.");
		}
	};

	const stopRecording = () => {
		clearInterval(timerRef.current);
		if (mediaRef.current && mediaRef.current.state !== "inactive") {
			mediaRef.current.stop();
		}
		setRecording(false);
	};

	const uploadVoice = async () => {
		if (!audioBlob) return;
		setUploading(true);
		setStatus(null);
		const result = await dispatch(sessionActions.uploadVoiceSample(audioBlob));
		setUploading(false);
		if (result?.error) {
			setErrorMsg(result.error);
			setStatus("error");
		} else {
			setStatus("saved");
		}
	};

	const deleteVoice = async () => {
		setUploading(true);
		await dispatch(sessionActions.deleteVoiceSample());
		setUploading(false);
		setAudioBlob(null);
		if (audioUrl) {
			URL.revokeObjectURL(audioUrl);
			setAudioUrl(null);
		}
	};

	return (
		<div className="bio-wrap agent-sa">
			<div className="gap15">
				<div className="about">AI 声音样本 / Voice Sample</div>
				<p style={{ color: "#64748b", fontSize: "0.875rem", margin: 0 }}>
					录制一段最多 30 秒的语音，用于生成小红书看房视频的 AI 口播。
					<br />
					Record up to 30 seconds of your voice for AI-powered property video narration.
				</p>

				{(hasVoice || audioBlob) && (
					<div className="voice-status">
						{hasVoice && !audioBlob && (
							<span style={{ color: "#16a34a", fontSize: "0.875rem" }}>
								✓ 已保存声音样本 / Voice sample saved
							</span>
						)}
						{audioBlob && (
							<audio
								controls
								src={audioUrl}
								style={{ width: "100%", marginTop: "8px" }}
							/>
						)}
					</div>
				)}

				<div className="service-area-btn-wrap" style={{ flexWrap: "wrap", gap: "8px" }}>
					{!recording ? (
						<button
							type="button"
							className="btn"
							onClick={startRecording}
							disabled={uploading}
						>
							{recording ? "录音中..." : "● 开始录音 Record"}
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

					{audioBlob && !recording && (
						<button
							type="button"
							className="btn"
							onClick={uploadVoice}
							disabled={uploading}
						>
							{uploading ? "保存中..." : "保存声音 Save Voice"}
						</button>
					)}

					{hasVoice && !audioBlob && (
						<button
							type="button"
							className="btn btn-bl"
							onClick={deleteVoice}
							disabled={uploading}
						>
							删除 Delete
						</button>
					)}
				</div>

				{status === "saved" && (
					<div style={{ color: "#16a34a", fontSize: "0.875rem" }}>
						✓ 声音样本已保存！/ Voice sample saved!
					</div>
				)}
				{status === "error" && (
					<div style={{ color: "#dc2626", fontSize: "0.875rem" }}>{errorMsg}</div>
				)}
				{!status && errorMsg && (
					<div style={{ color: "#dc2626", fontSize: "0.875rem" }}>{errorMsg}</div>
				)}
			</div>
		</div>
	);
};

export default VoiceRecorder;
