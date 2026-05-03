import { useState, useRef, useEffect } from "react";
import { Search, MapPin } from "lucide-react";

const GTA_BOUNDS = { north: 44.3, south: 43.2, east: -78.5, west: -80.5 };

const MapSearchBar = ({ onPlaceSelect }) => {
	const [query, setQuery] = useState("");
	const [predictions, setPredictions] = useState([]);
	const [activeIdx, setActiveIdx] = useState(-1);
	const autocompleteRef = useRef(null);
	const placesRef = useRef(null);
	const tokenRef = useRef(null);

	useEffect(() => {
		if (!window.google?.maps?.places) return;
		autocompleteRef.current = new window.google.maps.places.AutocompleteService();
		const div = document.createElement("div");
		placesRef.current = new window.google.maps.places.PlacesService(div);
		tokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
	}, []);

	const fetchPredictions = (val) => {
		if (!val.trim() || !autocompleteRef.current) { setPredictions([]); return; }
		const gtaBounds = new window.google.maps.LatLngBounds(
			{ lat: GTA_BOUNDS.south, lng: GTA_BOUNDS.west },
			{ lat: GTA_BOUNDS.north, lng: GTA_BOUNDS.east }
		);
		autocompleteRef.current.getPlacePredictions({
			input: val,
			componentRestrictions: { country: "ca" },
			bounds: gtaBounds,
			sessionToken: tokenRef.current,
		}, (results, status) => {
			if (status === window.google.maps.places.PlacesServiceStatus.OK && results) {
				setPredictions(results);
			} else {
				setPredictions([]);
			}
			setActiveIdx(-1);
		});
	};

	const selectPrediction = (pred) => {
		setQuery(pred.description);
		setPredictions([]);
		placesRef.current.getDetails({
			placeId: pred.place_id,
			fields: ["geometry", "types"],
			sessionToken: tokenRef.current,
		}, (place, status) => {
			tokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
			if (status !== window.google.maps.places.PlacesServiceStatus.OK || !place?.geometry) return;
			const lat = place.geometry.location.lat();
			const lng = place.geometry.location.lng();
			let bounds = null;
			if (place.geometry.viewport) {
				const vp = place.geometry.viewport;
				bounds = {
					north: vp.getNorthEast().lat(),
					east:  vp.getNorthEast().lng(),
					south: vp.getSouthWest().lat(),
					west:  vp.getSouthWest().lng(),
				};
			}
			onPlaceSelect(lat, lng, bounds);
		});
	};

	const handleKeyDown = (e) => {
		if (e.key === "ArrowDown") {
			if (!predictions.length) return;
			e.preventDefault();
			setActiveIdx(i => Math.min(i + 1, predictions.length - 1));
		} else if (e.key === "ArrowUp") {
			if (!predictions.length) return;
			e.preventDefault();
			setActiveIdx(i => Math.max(i - 1, -1));
		} else if (e.key === "Escape") {
			setPredictions([]);
			setActiveIdx(-1);
		}
	};

	const handleSubmit = (e) => {
		e.preventDefault();
		if (!predictions.length) return;
		const idx = activeIdx >= 0 ? activeIdx : 0;
		if (predictions[idx]) selectPrediction(predictions[idx]);
	};

	return (
		<div style={{ position: "relative", width: "100%" }}>
			<form onSubmit={handleSubmit} autoComplete="off">
			<div style={{
				display: "flex", alignItems: "center", gap: 8,
				background: "white", borderRadius: 10,
				boxShadow: "0 2px 10px rgba(0,0,0,.18)",
				padding: "8px 14px",
			}}>
				<Search size={15} strokeWidth={1.5} style={{ color: "#94a3b8", flexShrink: 0 }} />
				<input
					type="text"
					value={query}
					onChange={(e) => { setQuery(e.target.value); fetchPredictions(e.target.value); }}
					onKeyDown={handleKeyDown}
					onBlur={() => setTimeout(() => setPredictions([]), 160)}
					placeholder="City, neighbourhood, or address…"
					autoComplete="off"
					style={{
						border: "none", outline: "none", background: "transparent",
						fontSize: 13, width: "100%", color: "#0f172a",
					}}
				/>
			</div>
			</form>
			{predictions.length > 0 && (
				<div style={{
					position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
					background: "white", borderRadius: 10,
					boxShadow: "0 4px 16px rgba(0,0,0,.15)",
					overflow: "hidden", zIndex: 200,
				}}>
					{predictions.map((pred, i) => (
						<div
							key={pred.place_id}
							onMouseDown={() => selectPrediction(pred)}
							style={{
								display: "flex", alignItems: "center", gap: 8,
								padding: "9px 14px", cursor: "pointer",
								background: i === activeIdx ? "#f1f5f9" : "white",
								borderBottom: i < predictions.length - 1 ? "1px solid #f0f0ec" : "none",
							}}
						>
							<MapPin size={13} strokeWidth={1.5} style={{ color: "#94a3b8", flexShrink: 0 }} />
							<div style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
								<span style={{ fontWeight: 500 }}>{pred.structured_formatting?.main_text}</span>
								{pred.structured_formatting?.secondary_text && (
									<span style={{ color: "#94a3b8", marginLeft: 4 }}>
										{pred.structured_formatting.secondary_text}
									</span>
								)}
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
};

export default MapSearchBar;
