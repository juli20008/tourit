import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { createLiveTour, deleteLiveTour } from "../../../store/liveTours";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatScheduledAt(iso) {
  const d = new Date(iso);
  return d.toLocaleString("en-CA", {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

// ── Add-tour form (agents only) ───────────────────────────────────────────────

function AddLiveTourForm({ mlsNumber, onAdded }) {
  const dispatch = useDispatch();
  const [datetime, setDatetime] = useState("");
  const [url, setUrl]           = useState("");
  const [title, setTitle]       = useState("");
  const [error, setError]       = useState(null);
  const [saving, setSaving]     = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!datetime || !url) return;
    setSaving(true);
    setError(null);
    const scheduledAt = new Date(datetime).toISOString();
    const res = await dispatch(createLiveTour({ mls_number: mlsNumber, scheduled_at: scheduledAt, stream_url: url, title: title || undefined }));
    setSaving(false);
    if (res.errors) {
      setError(res.errors[0]);
    } else {
      setDatetime(""); setUrl(""); setTitle("");
      if (onAdded) onAdded();
    }
  };

  // min datetime = now (local)
  const minDt = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
    .toISOString().slice(0, 16);

  return (
    <form className="live-tour-add-form" onSubmit={submit}>
      <div className="live-tour-add-title">Schedule a Live Tour</div>
      <input
        className="select-input"
        type="datetime-local"
        value={datetime}
        min={minDt}
        onChange={e => setDatetime(e.target.value)}
        required
      />
      <input
        className="select-input"
        type="url"
        placeholder="Stream URL (YouTube, Zoom, etc.)"
        value={url}
        onChange={e => setUrl(e.target.value)}
        required
      />
      <input
        className="select-input"
        type="text"
        placeholder="Title (optional)"
        value={title}
        onChange={e => setTitle(e.target.value)}
      />
      {error && <div className="live-tour-error">{error}</div>}
      <button type="submit" className="btn btn-w" disabled={saving}>
        {saving ? "Saving…" : "Add Live Tour"}
      </button>
    </form>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const LiveTourSection = ({ mlsNumber, tours }) => {
  const dispatch   = useDispatch();
  const user       = useSelector(s => s.session.user);
  const isAgent    = user?.agent;
  const [open, setOpen]         = useState(false);
  const [showAdd, setShowAdd]   = useState(false);

  const upcomingTours = (tours || []).filter(t => new Date(t.scheduled_at) > new Date());

  return (
    <div className="live-tour-section">
      {/* ── Header toggle ── */}
      <div
        className={`live-tour-header${open ? " open" : ""}`}
        onClick={() => setOpen(o => !o)}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === "Enter" && setOpen(o => !o)}
      >
        <span>Live Tour</span>
        <i className={`fa-solid fa-chevron-${open ? "up" : "down"}`} />
      </div>

      {/* ── Body ── */}
      {open && (
        <div className="live-tour-body">
          {upcomingTours.length === 0 && !isAgent && (
            <div className="live-tour-empty">No live tours scheduled for this listing.</div>
          )}

          {upcomingTours.map(tour => (
            <div key={tour.id} className="live-tour-item">
              <div className="live-tour-item-info">
                <span className="live-tour-agent">{tour.agent_name}</span>
                <span className="live-tour-time">{formatScheduledAt(tour.scheduled_at)}</span>
                {tour.title && <span className="live-tour-label">{tour.title}</span>}
              </div>
              <div className="live-tour-item-actions">
                <a
                  href={tour.stream_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-w live-tour-join"
                >
                  Join
                </a>
                {isAgent && user.id === tour.agent_id && (
                  <button
                    type="button"
                    className="live-tour-delete"
                    onClick={() => dispatch(deleteLiveTour(tour.id, mlsNumber))}
                    title="Remove"
                  >
                    <i className="fa-solid fa-trash" />
                  </button>
                )}
              </div>
            </div>
          ))}

          {/* Agent: add-tour form toggle */}
          {isAgent && (
            showAdd
              ? <AddLiveTourForm mlsNumber={mlsNumber} onAdded={() => setShowAdd(false)} />
              : (
                <button
                  type="button"
                  className="live-tour-add-btn"
                  onClick={() => setShowAdd(true)}
                >
                  + Schedule a Live Tour
                </button>
              )
          )}
        </div>
      )}
    </div>
  );
};

export default LiveTourSection;
