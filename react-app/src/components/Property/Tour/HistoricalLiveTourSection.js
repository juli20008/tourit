import { useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { uploadHistoricalTour, deleteHistoricalTour } from "../../../store/historicalLiveTours";

const MAX_DURATION_S = 30;

function UploadForm({ mlsNumber, onDone }) {
  const dispatch = useDispatch();
  const [file, setFile]   = useState(null);
  const [title, setTitle] = useState("");
  const [durationErr, setDurationErr] = useState(null);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef();

  const handleFile = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setDurationErr(null);
    setError(null);
    const blobUrl = URL.createObjectURL(f);
    const vid = document.createElement("video");
    vid.preload = "metadata";
    vid.onloadedmetadata = () => {
      URL.revokeObjectURL(blobUrl);
      if (vid.duration > MAX_DURATION_S) {
        setDurationErr(`Video must be ${MAX_DURATION_S}s or shorter (yours is ${Math.round(vid.duration)}s).`);
        inputRef.current.value = "";
      } else {
        setFile(f);
      }
    };
    vid.src = blobUrl;
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
      <div className="hist-upload-hint">Vertical video · max {MAX_DURATION_S}s · mp4 / mov / webm</div>
      <input
        ref={inputRef}
        className="select-input"
        type="file"
        accept="video/mp4,video/quicktime,video/webm,video/x-m4v"
        onChange={handleFile}
      />
      <input
        className="select-input"
        type="text"
        placeholder="Caption (optional)"
        value={title}
        onChange={e => setTitle(e.target.value)}
      />
      {durationErr && <div className="hist-upload-error">{durationErr}</div>}
      {error     && <div className="hist-upload-error">{error}</div>}
      <button
        type="button"
        className="btn btn-w"
        disabled={!file || uploading}
        onClick={submit}
      >
        {uploading ? "Uploading…" : "Upload"}
      </button>
    </div>
  );
}

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

const HistoricalLiveTourSection = ({ mlsNumber, tours }) => {
  const dispatch = useDispatch();
  const user     = useSelector(s => s.session.user);
  const isAgent  = user?.agent;

  const [open, setOpen]       = useState(false);
  const [showForm, setShowForm] = useState(false);

  const myVideo     = isAgent ? (tours || []).find(t => t.agent_id === user.id) : null;
  const otherTours  = (tours || []).filter(t => !isAgent || t.agent_id !== user.id);
  const allTours    = myVideo ? [myVideo, ...otherTours] : otherTours;

  const hasContent  = allTours.length > 0 || isAgent;

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
