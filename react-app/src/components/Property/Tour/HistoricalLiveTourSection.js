import { useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { uploadHistoricalTour, deleteHistoricalTour } from "../../../store/historicalLiveTours";

const MAX_DURATION_S = 60;
const MAX_SIZE_BYTES = 50 * 1024 * 1024;   // 50 MB — triggers compression on desktop
const MAX_SIZE_DIRECT = 100 * 1024 * 1024; // 100 MB — max direct upload (server limit)

// iOS Safari has no MediaRecorder / captureStream — browser compression impossible
const canCompress =
  typeof MediaRecorder !== "undefined" &&
  typeof HTMLCanvasElement.prototype.captureStream === "function" &&
  MediaRecorder.isTypeSupported("video/webm");

// ── Helpers ───────────────────────────────────────────────────────────────────

function getVideoDuration(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const vid = document.createElement("video");
    vid.preload = "metadata";
    vid.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(vid.duration); };
    vid.onerror = () => { URL.revokeObjectURL(url); resolve(0); };
    vid.src = url;
  });
}

// Re-encode via canvas + MediaRecorder. Trims to MAX_DURATION_S if trim=true.
function processVideo(file, trim, onProgress) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const videoEl = document.createElement("video");
    videoEl.src = objectUrl;
    videoEl.preload = "auto";
    videoEl.muted = true; // keep muted to avoid autoplay policy blocks

    videoEl.onloadedmetadata = () => {
      const { videoWidth, videoHeight, duration } = videoEl;
      const effectiveDuration = trim ? Math.min(duration, MAX_DURATION_S) : duration;

      // Scale to max 720px on longest side, keep even dimensions
      const maxDim = 720;
      let w = videoWidth, h = videoHeight;
      if (w > maxDim || h > maxDim) {
        if (w >= h) { h = Math.round(h * maxDim / w); w = maxDim; }
        else        { w = Math.round(w * maxDim / h); h = maxDim; }
      }
      w = w % 2 ? w - 1 : w;
      h = h % 2 ? h - 1 : h;

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");

      // Audio capture — video stays muted visually but AudioContext still reads it
      let combinedStream;
      try {
        const audioCtx = new AudioContext();
        const src = audioCtx.createMediaElementSource(videoEl);
        const dest = audioCtx.createMediaStreamDestination();
        src.connect(dest);
        combinedStream = new MediaStream([
          ...canvas.captureStream(30).getVideoTracks(),
          ...dest.stream.getAudioTracks(),
        ]);
      } catch {
        combinedStream = canvas.captureStream(30);
      }

      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : "video/webm";

      const recorder = new MediaRecorder(combinedStream, {
        mimeType,
        videoBitsPerSecond: 4_000_000,
      });

      const chunks = [];
      recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

      let stopped = false;
      let hasStarted = false;

      const cleanup = () => {
        clearInterval(drawTimer);
        clearTimeout(failsafe);
        clearTimeout(startTimeout);
      };

      const stop = () => {
        if (stopped) return;
        stopped = true;
        cleanup();
        videoEl.pause();
        setTimeout(() => { try { recorder.stop(); } catch {} }, 300);
      };

      recorder.onstop = () => {
        cleanup();
        URL.revokeObjectURL(objectUrl);
        resolve(new Blob(chunks, { type: "video/webm" }));
      };

      // setInterval instead of requestAnimationFrame — rAF is throttled in
      // background tabs and causes the progress loop to stall indefinitely.
      // Skip stop-check until hasStarted so first ticks don't fire before play().
      const drawTimer = setInterval(() => {
        if (stopped) return;
        if (!hasStarted) return;
        if (trim && videoEl.currentTime >= MAX_DURATION_S) { stop(); return; }
        if (videoEl.ended || videoEl.paused) { stop(); return; }
        ctx.drawImage(videoEl, 0, 0, w, h);
        onProgress(Math.min(99, Math.round((videoEl.currentTime / effectiveDuration) * 100)));
      }, 1000 / 30);

      // Failsafe: force stop if nothing catches the end
      const failsafe = setTimeout(stop, (effectiveDuration + 5) * 1000);

      // If play() never fires within 8s, give up cleanly
      const startTimeout = setTimeout(() => {
        if (!hasStarted) { cleanup(); URL.revokeObjectURL(objectUrl); reject(new Error("playback blocked")); }
      }, 8000);

      videoEl.onplay  = () => { hasStarted = true; clearTimeout(startTimeout); };
      videoEl.onended = stop;
      videoEl.onerror = (e) => { cleanup(); URL.revokeObjectURL(objectUrl); reject(e); };

      recorder.start(200);
      videoEl.play().catch(() => {}); // startTimeout handles the failure
    };

    videoEl.onerror = (e) => { URL.revokeObjectURL(objectUrl); reject(e); };
  });
}

// ── Upload form ───────────────────────────────────────────────────────────────

function UploadForm({ mlsNumber, onDone }) {
  const dispatch = useDispatch();
  const [file, setFile]                         = useState(null);
  const [title, setTitle]                       = useState("");
  const [error, setError]                       = useState(null);
  const [processing, setProcessing]             = useState(false);
  const [processLabel, setProcessLabel]         = useState("");
  const [processProgress, setProcessProgress]   = useState(0);
  const [uploading, setUploading]               = useState(false);
  const inputRef = useRef();

  const handleFile = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setError(null);
    setFile(null);

    const dur = await getVideoDuration(f);
    const needsTrim     = dur > MAX_DURATION_S;
    const needsCompress = f.size > MAX_SIZE_BYTES;

    if ((needsTrim || needsCompress) && !canCompress) {
      // iOS Safari / browsers without MediaRecorder — can't compress in-browser
      if (needsTrim && needsCompress) {
        setError("此浏览器不支持自动压缩。请在相册 App 里把视频剪短到1分钟以内并压缩后再上传，或用电脑操作。");
      } else if (needsTrim) {
        setError("视频超过1分钟。请在相册 App 里剪短后再上传。");
      } else {
        // Over 50 MB but under direct-upload limit — allow it through
        if (f.size <= MAX_SIZE_DIRECT) {
          setFile(f);
        } else {
          setError("文件太大（超过95MB）。请在相册 App 里压缩后再上传，或用电脑操作。");
          inputRef.current.value = "";
        }
      }
      return;
    }

    if (needsTrim || needsCompress) {
      setProcessLabel(
        needsTrim && needsCompress ? "Trimming & compressing…"
        : needsTrim                ? "Trimming to 1 min…"
        :                           "Compressing…"
      );
      setProcessing(true);
      setProcessProgress(0);
      try {
        const blob = await processVideo(f, needsTrim, setProcessProgress);
        setProcessProgress(100);
        if (blob.size > MAX_SIZE_BYTES) {
          setError("Could not compress below 50 MB — try a shorter clip.");
          inputRef.current.value = "";
          setProcessing(false);
          return;
        }
        setFile(new File([blob], "highlight.webm", { type: "video/webm" }));
      } catch {
        setError("Processing failed — try a shorter or smaller file, or upload from desktop.");
        inputRef.current.value = "";
      }
      setProcessing(false);
    } else {
      setFile(f);
    }
  };

  const submit = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    const res = await dispatch(uploadHistoricalTour(mlsNumber, file, title));
    setUploading(false);
    if (res.errors) setError(res.errors[0]);
    else onDone();
  };

  return (
    <div className="hist-upload-form">
      <div className="hist-upload-title">Upload Highlight Clip</div>
      <div className="hist-upload-hint">
        mp4 / mov / webm · {canCompress ? "large files auto-compressed · videos over 1 min auto-trimmed" : "max 100 MB · max 1 min · iPhone browser cannot auto-compress, please trim/compress in Photos app first"}
      </div>
      <input
        ref={inputRef}
        className="select-input"
        type="file"
        accept="video/mp4,video/quicktime,video/webm,video/x-m4v"
        onChange={handleFile}
        disabled={processing}
      />

      {processing && (
        <div className="hist-compress-wrap">
          <div className="hist-compress-bar" style={{ width: `${processProgress}%` }} />
          <span className="hist-compress-label">{processLabel} {processProgress}%</span>
        </div>
      )}

      <input
        className="select-input"
        type="text"
        placeholder="Caption (optional)"
        value={title}
        onChange={e => setTitle(e.target.value)}
        disabled={processing || uploading}
      />
      {error && <div className="hist-upload-error">{error}</div>}
      <button
        type="button"
        className="btn btn-w"
        disabled={!file || uploading || processing}
        onClick={submit}
      >
        {uploading ? "Uploading…" : "Upload"}
      </button>
    </div>
  );
}

// ── Video card ────────────────────────────────────────────────────────────────

function VideoCard({ tour, isOwn, onDelete }) {
  return (
    <div className="hist-video-card">
      <video
        className="hist-video"
        src={tour.video_url}
        controls
        playsInline
        preload="metadata"
      />
      <div className="hist-video-meta">
        <div className="hist-video-agent">
          {tour.agent_photo && (
            <img src={tour.agent_photo} alt="" className="hist-agent-avatar" />
          )}
          <span>{tour.agent_name}</span>
        </div>
        {tour.title && <div className="hist-video-title">{tour.title}</div>}
      </div>
      {isOwn && (
        <button type="button" className="hist-video-delete" onClick={onDelete} title="Remove">
          <i className="fa-solid fa-trash" />
        </button>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const HistoricalLiveTourSection = ({ mlsNumber, tours }) => {
  const dispatch = useDispatch();
  const user     = useSelector(s => s.session.user);
  const isAgent  = user?.agent;

  const [open, setOpen]         = useState(false);
  const [showForm, setShowForm] = useState(false);

  const myVideo    = isAgent ? (tours || []).find(t => t.agent_id === user.id) : null;
  const otherTours = (tours || []).filter(t => !isAgent || t.agent_id !== user.id);
  const allTours   = myVideo ? [myVideo, ...otherTours] : otherTours;
  const hasContent = allTours.length > 0 || isAgent;

  if (!hasContent) return null;

  return (
    <div className="hist-section">
      <div
        className={`hist-header${open ? " open" : ""}`}
        onClick={() => setOpen(o => !o)}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === "Enter" && setOpen(o => !o)}
      >
        <span>Highlight Clips</span>
        <i className={`fa-solid fa-chevron-${open ? "up" : "down"}`} />
      </div>

      {open && (
        <div className="hist-body">
          {allTours.map(tour => (
            <VideoCard
              key={tour.id}
              tour={tour}
              isOwn={isAgent && tour.agent_id === user.id}
              onDelete={() => dispatch(deleteHistoricalTour(tour.id, mlsNumber))}
            />
          ))}

          {isAgent && (
            showForm || myVideo
              ? (
                showForm
                  ? <UploadForm mlsNumber={mlsNumber} onDone={() => setShowForm(false)} />
                  : (
                    <button
                      type="button"
                      className="hist-replace-btn"
                      onClick={() => setShowForm(true)}
                    >
                      <i className="fa-solid fa-rotate" /> Replace my clip
                    </button>
                  )
              )
              : (
                <button
                  type="button"
                  className="live-tour-add-btn"
                  onClick={() => setShowForm(true)}
                >
                  + Upload a Highlight Clip
                </button>
              )
          )}

          {allTours.length === 0 && !isAgent && (
            <div className="live-tour-empty">No highlight clips yet for this listing.</div>
          )}
        </div>
      )}
    </div>
  );
};

export default HistoricalLiveTourSection;
