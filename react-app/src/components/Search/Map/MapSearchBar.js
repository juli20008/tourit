import { useState, useRef, useEffect } from "react";
import { useHistory } from "react-router-dom";
import { Search, MapPin, X, Clock } from "lucide-react";
import { resolveUrl } from "../../../utils/imageResolver";
import { ensureAddrIndex, searchAddr } from "../../../utils/addressIndex";

const GTA_BOUNDS = { north: 44.3, south: 43.2, east: -78.5, west: -80.5 };
const RECENT_KEY = "tourit_recent_searches";
const MAX_RECENT = 6;

const loadRecent = () => {
	try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); }
	catch { return []; }
};

const saveRecent = (item) => {
	try {
		const prev = loadRecent().filter(r => r.id !== item.id);
		localStorage.setItem(RECENT_KEY, JSON.stringify([item, ...prev].slice(0, MAX_RECENT)));
	} catch {}
};

const SectionLabel = ({ children }) => (
	<div style={{
		padding: "6px 14px 4px",
		fontSize: 11, fontWeight: 600, color: "#94a3b8",
		textTransform: "uppercase", letterSpacing: "0.06em",
		borderBottom: "1px solid #f0f0ec",
		background: "#fafafa",
	}}>
		{children}
	</div>
);

const MapSearchBar = ({ onPlaceSelect, googleReady }) => {
	const history = useHistory();
	const [query, setQuery]         = useState("");
	const [places, setPlaces]       = useState([]);
	const [listings, setListings]   = useState([]);
	const [recent, setRecent]       = useState([]);
	const [focused, setFocused]     = useState(false);
	const [activeIdx, setActiveIdx] = useState(-1);
	const autocompleteRef = useRef(null);
	const placesRef       = useRef(null);
	const tokenRef        = useRef(null);
	const queryRef        = useRef("");

	useEffect(() => {
		if (!googleReady || !window.google?.maps?.places) return;
		autocompleteRef.current = new window.google.maps.places.AutocompleteService();
		const div = document.createElement("div");
		placesRef.current = new window.google.maps.places.PlacesService(div);
		tokenRef.current  = new window.google.maps.places.AutocompleteSessionToken();
	}, [googleReady]);

	// Pre-load the address index; if user already typed, show results immediately.
	useEffect(() => {
		ensureAddrIndex().then(() => {
			if (queryRef.current.trim().length >= 2) {
				setListings(searchAddr(queryRef.current));
			}
		}).catch(() => {});
	}, []);

	const fetchPlaces = (val) => {
		if (!val.trim() || !autocompleteRef.current) { setPlaces([]); return; }
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
			setPlaces(
				status === window.google.maps.places.PlacesServiceStatus.OK && results
					? results.slice(0, 5)
					: []
			);
			setActiveIdx(-1);
		});
	};

	const handleChange = (e) => {
		const val = e.target.value;
		setQuery(val);
		queryRef.current = val;
		if (!val.trim()) { setPlaces([]); setListings([]); return; }
		fetchPlaces(val);
		setListings(searchAddr(val));
	};

	const handleFocus = () => {
		setFocused(true);
		if (!query.trim()) setRecent(loadRecent());
	};

	const closeDropdown = () => {
		setPlaces([]); setListings([]); setActiveIdx(-1); setFocused(false);
	};

	const clearSearch = () => {
		setQuery("");
		setPlaces([]);
		setListings([]);
		setActiveIdx(-1);
		setRecent(loadRecent());
		// keep focused=true so recent dropdown appears after clearing
	};

	const selectPlace = (pred) => {
		setQuery(pred.description);
		saveRecent({ id: pred.place_id, type: "place", label: pred.description, data: pred });
		closeDropdown();
		placesRef.current.getDetails({
			placeId: pred.place_id,
			fields: ["geometry"],
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
					north: vp.getNorthEast().lat(), east: vp.getNorthEast().lng(),
					south: vp.getSouthWest().lat(), west: vp.getSouthWest().lng(),
				};
			}
			onPlaceSelect(lat, lng, bounds);
		});
	};

	const selectListing = (listing) => {
		const unit = listing.unit ? `${listing.unit}-` : "";
		const addr = [unit + listing.street, listing.city].filter(Boolean).join(", ");
		saveRecent({
			id: listing.mls_number || listing.listing_id || listing.id,
			type: "listing",
			label: addr || listing.mls_number || listing.listing_id,
			data: listing,
		});
		closeDropdown();
		setQuery("");
		history.push(`/listing/${encodeURIComponent(listing.mls_number || listing.listing_id)}`);
	};

	const selectRecent = (item) => {
		if (item.type === "place") selectPlace(item.data);
		else selectListing(item.data);
	};

	const showRecent = focused && !query.trim() && recent.length > 0;
	const hasDropdown = places.length > 0 || listings.length > 0 || showRecent;

	// Flat list for keyboard nav: recent OR (listings first, then places)
	const allItems = showRecent
		? recent.map(r => ({ type: "recent", data: r }))
		: [
			...listings.map(l => ({ type: "listing", data: l })),
			...places.map(p   => ({ type: "place",   data: p })),
		];

	const handleKeyDown = (e) => {
		if (e.key === "ArrowDown") {
			if (!allItems.length) return;
			e.preventDefault();
			setActiveIdx(i => Math.min(i + 1, allItems.length - 1));
		} else if (e.key === "ArrowUp") {
			if (!allItems.length) return;
			e.preventDefault();
			setActiveIdx(i => Math.max(i - 1, -1));
		} else if (e.key === "Escape") {
			closeDropdown();
		} else if (e.key === "Enter") {
			e.preventDefault();
			const item = allItems[activeIdx >= 0 ? activeIdx : 0];
			if (!item) return;
			if (item.type === "recent")   selectRecent(item.data);
			else if (item.type === "place") selectPlace(item.data);
			else                            selectListing(item.data);
		}
	};

	const handleSubmit = (e) => {
		e.preventDefault();
		const item = allItems[activeIdx >= 0 ? activeIdx : 0];
		if (!item) return;
		if (item.type === "recent")   selectRecent(item.data);
		else if (item.type === "place") selectPlace(item.data);
		else                            selectListing(item.data);
	};

	let flatIdx = 0;

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
						onChange={handleChange}
						onKeyDown={handleKeyDown}
						onFocus={handleFocus}
						onBlur={() => setTimeout(closeDropdown, 160)}
						placeholder="City, neighbourhood, address, or MLS#…"
						autoComplete="off"
						style={{
							border: "none", outline: "none", background: "transparent",
							fontSize: 13, width: "100%", color: "#0f172a",
						}}
					/>
					{query && (
						<button
							type="button"
							onMouseDown={(e) => { e.preventDefault(); clearSearch(); }}
							style={{
								background: "none", border: "none", padding: 2,
								cursor: "pointer", color: "#94a3b8", flexShrink: 0,
								display: "flex", alignItems: "center", lineHeight: 1,
							}}
						>
							<X size={14} strokeWidth={2} />
						</button>
					)}
				</div>
			</form>

			{hasDropdown && (
				<div style={{
					position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
					background: "white", borderRadius: 10,
					boxShadow: "0 4px 20px rgba(0,0,0,.15)",
					overflow: "hidden", zIndex: 200,
					maxHeight: 500, overflowY: "auto",
				}}>
					{/* ── Recent Searches ── */}
					{showRecent && (
						<>
							<SectionLabel>Recent Searches</SectionLabel>
							{recent.map((item) => {
								const myIdx = flatIdx++;
								return (
									<div
										key={item.id}
										onMouseDown={() => selectRecent(item)}
										style={{
											display: "flex", alignItems: "center", gap: 8,
											padding: "9px 14px", cursor: "pointer",
											background: myIdx === activeIdx ? "#f1f5f9" : "white",
											borderBottom: "1px solid #f0f0ec",
										}}
									>
										<Clock size={13} strokeWidth={1.5} style={{ color: "#94a3b8", flexShrink: 0 }} />
										<div style={{
											fontSize: 13, flex: 1, minWidth: 0,
											overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
											color: "#374151",
										}}>
											{item.label}
										</div>
										<span style={{ fontSize: 11, color: "#cbd5e1", flexShrink: 0 }}>
											{item.type === "listing" ? "Listing" : "Location"}
										</span>
									</div>
								);
							})}
						</>
					)}

					{/* ── Listings ── */}
					{listings.length > 0 && (
						<>
							<SectionLabel>Listings</SectionLabel>
							{listings.map((listing) => {
								const myIdx   = flatIdx++;
								const img     = resolveUrl(listing.front_img || listing.image_url);
								const isLease = (listing.transaction_type || "").toLowerCase().includes("lease");
								const unit    = listing.unit ? `${listing.unit}-` : "";
								const addr    = [unit + listing.street, listing.city].filter(Boolean).join(", ");
								const price   = listing.price
									? `$${Number(listing.price).toLocaleString()}`
									: null;
								return (
									<div
										key={listing.id || listing.mls_number}
										onMouseDown={() => selectListing(listing)}
										style={{
											display: "flex", alignItems: "center", gap: 10,
											padding: "8px 14px", cursor: "pointer",
											background: myIdx === activeIdx ? "#f1f5f9" : "white",
											borderBottom: "1px solid #f0f0ec",
										}}
									>
										<div style={{
											width: 54, height: 40, borderRadius: 6,
											overflow: "hidden", flexShrink: 0, background: "#f0f0ec",
										}}>
											{img && (
												<img
													src={img}
													alt=""
													loading="lazy"
													style={{ width: "100%", height: "100%", objectFit: "cover" }}
													onError={(e) => { e.currentTarget.style.display = "none"; }}
												/>
											)}
										</div>
										<div style={{ flex: 1, minWidth: 0 }}>
											<div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 4 }}>
												{price && (
													<span style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{price}</span>
												)}
												<span style={{ fontSize: 11, color: isLease ? "#16a34a" : "#2563eb", flexShrink: 0 }}>
													{isLease ? "For Lease" : "For Sale"}
												</span>
											</div>
											<div style={{ fontSize: 12, color: "#475569", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
												{addr}
											</div>
											<div style={{ fontSize: 11, color: "#94a3b8" }}>
												{listing.category || listing.type || ""}
												{listing.bed  ? ` · ${listing.bed} bd`  : ""}
												{listing.bath ? ` · ${listing.bath} ba` : ""}
											</div>
										</div>
									</div>
								);
							})}
						</>
					)}

					{/* ── Locations ── */}
					{places.length > 0 && (
						<>
							<SectionLabel>Locations</SectionLabel>
							{places.map((pred) => {
								const myIdx = flatIdx++;
								return (
									<div
										key={pred.place_id}
										onMouseDown={() => selectPlace(pred)}
										style={{
											display: "flex", alignItems: "center", gap: 8,
											padding: "9px 14px", cursor: "pointer",
											background: myIdx === activeIdx ? "#f1f5f9" : "white",
											borderBottom: "1px solid #f0f0ec",
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
								);
							})}
						</>
					)}
				</div>
			)}
		</div>
	);
};

export default MapSearchBar;
