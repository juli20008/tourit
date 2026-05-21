import { useCallback, useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { Redirect } from "react-router-dom";

const CAM_MARGIN = 20;

function fmtTime(s) {
  const m = String(Math.floor(s / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return `${m}:${sec}`;
}

// Safe roundRect for all browsers
function roundRect(ctx, x, y, w, h, r) {
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}

const TourRecorder = () => {
  const user = useSelector(s => s.session.user);

  const canvasRef       = useRef(null);
  const displayVidRef   = useRef(null);
  const camVidRef       = useRef(null);
  const recorderRef     = useRef(null);
  const chunksRef       = useRef([]);
  const animRef         = useRef(null);
  const displayStreamRef = useRef(null);
  const cameraStreamRef  = useRef(null);
  const timerRef        = useRef(null);
  const stoppedRef      = useRef(false);

  const [status, setStatus]   = useState("idle"); // idle | recording | done
  const [blobUrl, setBlobUrl] = useState(null);
  const [error, setError]     = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [hasCam, setHasCam]   = useState(true);

  // Redirect non-agents
  if (!user?.agent) return <Redirect to="/" />;

  const drawLoop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);

    // Main feed
    const dv = displayVidRef.current;
    if (dv && dv.readyState >= 2) ctx.drawImage(dv, 0, 0, W, H);

    // Webcam PiP — 18% of height, 4:3
    const camH = Math.round(H * 0.18);
    const camW = Math.round(camH * (4 / 3));
    const x = W - camW - CAM_MARGIN;
    const y = H - camH - CAM_MARGIN;
    const r = 10;

    const cv = camVidRef.current;
    if (cv && cv.readyState >= 2) {
      // Drop-shadow
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = 14;
      roundRect(ctx, x, y, camW, camH, r);
      ctx.fillStyle = "#000";
      ctx.fill();
      ctx.restore();

      // Mirrored webcam
      ctx.save();
      roundRect(ctx, x, y, camW, camH, r);
      ctx.clip();
      ctx.translate(x + camW, y);
      ctx.scale(-1, 1);
      ctx.drawImage(cv, 0, 0, camW, camH);
      ctx.restore();

      // White border
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.lineWidth = 2.5;
      roundRect(ctx, x, y, camW, camH, r);
      ctx.stroke();
      ctx.restore();
    }

    animRef.current = requestAnimationFrame(drawLoop);
  }, []);

  const stopAll = useCallback(() => {
    if (stoppedRef.current) return;
    stoppedRef.current = true;
    cancelAnimationFrame(animRef.current);
    clearInterval(timerRef.current);
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    displayStreamRef.current?.getTracks().forEach(t => t.stop());
    cameraStreamRef.current?.getTracks().forEach(t => t.stop());
  }, []);

  const startRecording = async () => {
    setError(null);
    setBlobUrl(null);
    setElapsed(0);
    stoppedRef.current = false;

    // Screen / window / tab share
    let displayStream;
    try {
      displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30 } },
        audio: true,
      });
    } catch {
      setError("Screen access denied or cancelled.");
      return;
    }

    // Webcam (optional — gracefully skipped if denied)
    let cameraStream = null;
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 }, facingMode: "user" },
        audio: true,
      });
      setHasCam(true);
    } catch {
      setHasCam(false);
    }

    displayStreamRef.current = displayStream;
    cameraStreamRef.current = cameraStream;

    // Feed display stream into hidden video element
    const dv = displayVidRef.current;
    dv.srcObject = displayStream;
    dv.muted = true;
    await dv.play().catch(() => {});

    if (cameraStream) {
      const cv = camVidRef.current;
      cv.srcObject = cameraStream;
      cv.muted = true;
      await cv.play().catch(() => {});
    }

    // Size canvas to source
    const settings = displayStream.getVideoTracks()[0].getSettings();
    const canvas = canvasRef.current;
    canvas.width  = settings.width  || 1920;
    canvas.height = settings.height || 1080;

    drawLoop();

    // Mix audio: display audio + camera mic
    let audioTracks = [];
    try {
      const audioCtx = new AudioContext();
      const dest = audioCtx.createMediaStreamDestination();
      const add = (track) => {
        audioCtx.createMediaStreamSource(new MediaStream([track])).connect(dest);
      };
      displayStream.getAudioTracks().forEach(add);
      cameraStream?.getAudioTracks().forEach(add);
      audioTracks = dest.stream.getAudioTracks();
    } catch {
      audioTracks = displayStream.getAudioTracks();
    }

    const outStream = new MediaStream([
      ...canvas.captureStream(30).getVideoTracks(),
      ...audioTracks,
    ]);

    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
      ? "video/webm;codecs=vp9,opus"
      : "video/webm";

    chunksRef.current = [];
    const recorder = new MediaRecorder(outStream, { mimeType, videoBitsPerSecond: 8_000_000 });
    recorder.ondataavailable = e => { if (e.data.size) chunksRef.current.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      setBlobUrl(URL.createObjectURL(blob));
      setStatus("done");
    };
    recorder.start(500);
    recorderRef.current = recorder;

    // Auto-stop when user ends screen share via browser UI
    displayStream.getVideoTracks()[0].onended = () => stopAll();

    timerRef.current = setInterval(() => setElapsed(t => t + 1), 1000);
    setStatus("recording");
  };

  const stopRecording = () => stopAll();

  const recordAgain = () => {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    setBlobUrl(null);
    setElapsed(0);
    setStatus("idle");
  };

  const download = () => {
    if (!blobUrl) return;
    const ts = new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-");
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `tour-${ts}.webm`;
    a.click();
  };

  // Cleanup on unmount
  useEffect(() => () => {
    stopAll();
    if (blobUrl) URL.revokeObjectURL(blobUrl);
  }, []); // eslint-disable-line

  return (
    <div style={{ minHeight: "100vh", background: "#0f172a", color: "#f8fafc", display: "flex", flexDirection: "column", fontFamily: "sans-serif" }}>

      {/* Top bar */}
      <div style={{ padding: "18px 28px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center" }}>
        <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.01em" }}>🎬 Tour Recording Studio</span>

        {status === "recording" && (
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ef4444", display: "inline-block", animation: "rec-pulse 1.2s ease-in-out infinite" }} />
            <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600, fontSize: 15 }}>{fmtTime(elapsed)}</span>
            <button
              onClick={stopRecording}
              style={{ marginLeft: 16, padding: "7px 20px", background: "#ef4444", color: "white", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            >
              Stop
            </button>
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 24px", gap: 20 }}>

        {/* Live canvas preview */}
        {status === "recording" && (
          <div style={{ width: "100%", maxWidth: 960, borderRadius: 12, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
            <canvas ref={canvasRef} style={{ width: "100%", display: "block" }} />
          </div>
        )}

        {/* Idle */}
        {status === "idle" && (
          <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 18, maxWidth: 480 }}>
            <div style={{ fontSize: 52 }}>🎬</div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Ready to record</div>
              <div style={{ color: "#94a3b8", fontSize: 14, lineHeight: 1.7 }}>
                You'll choose what to share — screen, a window, or your camera feed. Your webcam will appear as a picture-in-picture in the bottom right corner.
              </div>
              <div style={{ color: "#64748b", fontSize: 12, marginTop: 10, lineHeight: 1.6 }}>
                Tip: to avoid a mirror loop, share a specific window rather than your entire screen.
              </div>
            </div>
            {error && <div style={{ color: "#f87171", fontSize: 14 }}>{error}</div>}
            {!hasCam && (
              <div style={{ color: "#fbbf24", fontSize: 13 }}>
                Camera access denied — webcam PiP will be skipped.
              </div>
            )}
            <button
              onClick={startRecording}
              style={{ padding: "13px 40px", background: "#3b82f6", color: "white", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: "pointer", marginTop: 4 }}
            >
              Start Recording
            </button>
          </div>
        )}

        {/* Done */}
        {status === "done" && blobUrl && (
          <div style={{ width: "100%", maxWidth: 960, display: "flex", flexDirection: "column", gap: 14 }}>
            <video
              src={blobUrl}
              controls
              style={{ width: "100%", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", background: "#000" }}
            />
            <div style={{ display: "flex", gap: 12 }}>
              <button
                onClick={download}
                style={{ flex: 1, padding: "13px 0", background: "#3b82f6", color: "white", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: "pointer" }}
              >
                ⬇ Download
              </button>
              <button
                onClick={recordAgain}
                style={{ padding: "13px 24px", background: "rgba(255,255,255,0.07)", color: "#f1f5f9", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, fontSize: 14, cursor: "pointer" }}
              >
                Record Again
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Hidden video elements used as canvas sources */}
      <video ref={displayVidRef} style={{ display: "none" }} playsInline muted />
      <video ref={camVidRef}     style={{ display: "none" }} playsInline muted />

      <style>{`
        @keyframes rec-pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.15; }
        }
      `}</style>
    </div>
  );
};

export default TourRecorder;
