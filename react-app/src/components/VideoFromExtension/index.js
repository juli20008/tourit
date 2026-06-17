import { useState, useEffect } from "react";
import { useLocation, useHistory } from "react-router-dom";
import { useSelector } from "react-redux";
import apiFetch from "../../utils/apiFetch";
import XHSVideoModal from "../Appointments/MyListings/XHSVideoModal";

const VideoFromExtension = () => {
	const location = useLocation();
	const history = useHistory();
	const user = useSelector((state) => state.session.user);
	const [listing, setListing] = useState(null);
	const [error, setError] = useState("");

	const token = new URLSearchParams(location.search).get("token");

	useEffect(() => {
		if (!token) {
			setError("No token provided.");
			return;
		}
		apiFetch(`/api/scrape/pending?token=${encodeURIComponent(token)}`)
			.then((r) => {
				if (!r.ok) throw new Error(r.status === 410 ? "Link expired." : "Listing not found.");
				return r.json();
			})
			.then((data) => setListing(data.listing))
			.catch((e) => setError(e.message));
	}, [token]);

	if (!user) {
		// Save the current URL so we can come back after login
		sessionStorage.setItem("tourReturn", location.pathname + location.search);
		history.replace("/agent-login");
		return null;
	}

	if (error) {
		return (
			<div style={{ padding: 40, textAlign: "center", color: "#ef4444" }}>
				<p>{error}</p>
				<button className="btn" onClick={() => history.push("/appointments")}>
					Go to Dashboard
				</button>
			</div>
		);
	}

	if (!listing) {
		return (
			<div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>
				Loading listing…
			</div>
		);
	}

	// Map external listing fields to what XHSVideoModal expects
	const modalListing = {
		mls_number: listing.mls_number,
		listing_id: listing.mls_number,
		street:     listing.street,
		address:    listing.label,
		city:       listing.city,
		price:      listing.list_price,
		bed:        listing.bed,
		bath:       listing.bath,
		front_img:  listing.images?.[0] || null,
	};

	return (
		<XHSVideoModal
			listing={modalListing}
			externalListing={listing}
			onClose={() => history.push("/appointments")}
			onGenerated={() => {}}
		/>
	);
};

export default VideoFromExtension;
