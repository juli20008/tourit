import { useState, useEffect } from "react";
import { useLocation, useHistory } from "react-router-dom";
import apiFetch from "../../utils/apiFetch";

const VideoFromExtension = () => {
	const location = useLocation();
	const history = useHistory();
	const [error, setError] = useState("");

	const mlsNumber = new URLSearchParams(location.search).get("mls");

	useEffect(() => {
		if (!mlsNumber) { setError("No listing specified."); return; }
		apiFetch(`/api/listings/${encodeURIComponent(mlsNumber)}`)
			.then((r) => { if (!r.ok) throw new Error("Listing not found."); return r.json(); })
			.then(() => history.replace(`/listing/${encodeURIComponent(mlsNumber)}`))
			.catch((e) => setError(e.message));
	}, [mlsNumber]); // eslint-disable-line react-hooks/exhaustive-deps

	if (error) return (
		<div style={{ padding: 40, textAlign: "center", color: "#ef4444" }}>
			<p>{error}</p>
			<button className="btn" onClick={() => history.push("/appointments")}>Go to Dashboard</button>
		</div>
	);

	return (
		<div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>Loading listing…</div>
	);
};

export default VideoFromExtension;
