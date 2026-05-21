import { useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { uploadHistoricalTour, deleteHistoricalTour } from "../../../store/historicalLiveTours";

const MAX_DURATION_S = 60;
const MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

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

// Re-encode using canvas + MediaRecorder. Returns a webm Blob at ~4 Mbps.
function compressVideo(file, onProgress) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const videoEl = document.createElement("video");
    videoEl.src = objectUrl;
    videoEl.preload = "auto";
    videoEl.muted = true; // muted so autoplay works; audio added via AudioContext below

    videoEl.onloadedmetadata = () => {
      const { videoWidth, videoHeight, duration } = videoEl;

      // Scale to max 720px on the longest side, keep even dimensions
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

      // Route audio from the video element so the output has sound
      let combinedStream;
      try {
        const audioCtx = new AudioContext();
        const src = audioCtx.createMediaElementSource(videoEl);
        const dest = audioCtx.createMediaStreamDestination();
        src.connect(dest);
        src.connect(audioCtx.destination);
        videoEl.muted = false;
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
        videoBitsPerSecond: 4_000_000, // 4 Mbps → ~30 MB for 60s
      });

      const chunks = [];
      recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      recorder.onstop = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(new Blob(chunks, { type: "video/webm" }));
      };

      recorder.start(200);
      videoEl.play();

      const draw = () => {
        if (videoEl.ended || videoEl.paused) return;
        ctx.drawImage(videoEl, 0, 0, w, h);
        onProgress(Math.min(99, Math.round((videoEl.currentTime / duration) * 100)));
        requestAnimationFrame(draw);
      };
      requestAnimationFrame(draw);

      videoEl.onended = () => setTimeout(() => recorder.stop(), 300);
      videoEl.onerror = (e) => { URL.revokeObjectURL(objectUrl); reject(e); };
    };

    videoEl.onerror = (e) => { URL.revokeObjectURL(objectUrl); reject(e); };
  });
}

// ── Upload form ───────────────────────────────────────────────────────────────

function UploadForm({ mlsNumber, onDone }) {
  const dispatch = useDispatch();
  const [file, setFile]                   = useState(null);
  const [title, setTitle]                 = useState("");
  const [durationErr, setDurationErr]     = useState(null);
  const [error, setError]                 = useState(null);
  const [compressing, setCompressing]     = useState(false);
  const [compressProgress, setCompressProgress] = useState(0);
  const [uploading, setUploading]         = useState(false);
  const inputRef = useRef();

  const handleFile = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setDurationErr(null);
    setError(null);
    setFile(null);

    const dur = await getVideoDuration(f);
    if (dur > MAX_DURATION_S) {
      setDurationErr(`Max ${MAX_DURATION_S}s (yours is ${Math.round(dur)}s).`);
      inputRef.current.value = "";
      return;
    }

    if (f.size > MAX_SIZE_BYTES) {
      setCompressing(true);
      setCompressProgress(0);
      try {
        const blob = await compressVideo(f, setCompressProgress);
        setCompressProgress(100);
        if (blob.size > MAX_SIZE_BYTES) {
          setError("Could not compress below 50 MB — please trim the clip and try again.");
          inputRef.current.value = "";
          setCompressing(false);
          return;
        }
        setFile(new File([blob], "highlight.webm", { type: "video/webm" }));
      } catch {
        setError("Compression failed. Please use a smaller or shorter file.");
        inputRef.current.value = "";
      }
      setCompressing(false);
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
    if (res.errors) {
      setError(res.errors[0]);
    } else {
      onDone();
    }
  };

  return (
    <div className="hist-upload-form">
      <div className="hist-upload-title">Upload Highlight Clip</div>
      <div className="hist-upload-hint">
        Max {MAX_DURATION_S}s · mp4 / mov / webm · files over 50 MB auto-compressed
      </div>
      <input
        ref={inputRef}
        className="select-input"
        type="file"
        accept="video/mp4,video/quicktime,video/webm,video/x-m4v"
        onChange={handleFile}
        disabled={compressing}
      />

      {compressing && (
        <div className="hist-compress-wrap">
          <div className="hist-compress-bar" style={{ width: `${compressProgress}%` }} />
          <span className="hist-compress-label">Compressing… {compressProgress}%</span>
        </div>
      )}

      <input
        className="select-input"
        type="text"
        placeholder="Caption (optional)"
        value={title}
        onChange={e => setTitle(e.target.value)}
        disabled={compressing || uploading}
      />
      {durationErr && <div className="hist-upload-error">{durationErr}</div>}
      {error       && <div className="hist-upload-error">{error}</div>}
      <button
        type="button"
        className="btn btn-w"
        disabled={!file || uploading || compressing}
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

  return (
    <div className="hist-section">
      <div
        className={`hist-header${open ? " open" : ""}${!hasContent ? " disabled" : ""}`}
        onClick={() => hasContent && setOpen(o => !o)}
        role="button"
        tabIndex={hasContent ? 0 : -1}
        onKeyDown={e => hasContent && e.key === "Enter" && setOpen(o => !o)}
        title={!hasContent ? "No highlight clips yet" : undefined}
      >
        <span>Highlight Clips</span>
        {hasContent
          ? <i className={`fa-solid fa-chevron-${open ? "up" : "down"}`} />
          : <i className="fa-solid fa-ban" style={{ fontSize: 12 }} />
        }
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
