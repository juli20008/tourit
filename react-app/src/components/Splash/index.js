import { Loader } from "@googlemaps/js-api-loader";
import { useState, useEffect, useMemo, useRef } from "react";
import { useHistory } from "react-router-dom";
import apiFetch from "../../utils/apiFetch";
import { resolveUrl } from "../../utils/imageResolver";
import { ensureAddrIndex, searchAddr } from "../../utils/addressIndex";
import {
	ArrowRight,
	Bookmark,
	MapPin,
	Search,
	SlidersHorizontal,
	TrendingUp,
} from "lucide-react";

import MyMap from "../Search/Map";
import List from "../Search/List";
import Footer from "./Footer";

const TORONTO = { lat: 43.7417, lng: -79.3733 };

const zoomForTypes = (types = []) => {
	if (types.some((t) => ["street_address", "premise", "route"].includes(t))) return 15;
	if (types.some((t) => ["neighborhood", "sublocality", "sublocality_level_1"].includes(t))) return 14;
	if (types.some((t) => ["locality", "administrative_area_level_3"].includes(t))) return 12;
	if (types.includes("administrative_area_level_2")) return 11;
	return 13;
};

const toAreaURL = (place) => {
	const zoom = zoomForTypes(place.types || []);
	let neLat, neLng, swLat, swLng;
	if (place.geometry.viewport) {
		const vp = place.geometry.viewport;
		neLat = vp.getNorthEast().lat();
		neLng = vp.getNorthEast().lng();
		swLat = vp.getSouthWest().lat();
		swLng = vp.getSouthWest().lng();
	} else {
		const lat = place.geometry.location.lat();
		const lng = place.geometry.location.lng();
		const delta = 0.04;
		neLat = lat + delta; neLng = lng + delta;
		swLat = lat - delta; swLng = lng - delta;
	}
	return `/area/neLat=${neLat.toFixed(5)}&neLng=${neLng.toFixed(5)}&swLat=${swLat.toFixed(5)}&swLng=${swLng.toFixed(5)}&zoom=${zoom}`;
};

const defaultGtaArea = "/area/neLat=43.855&neLng=-79.12&swLat=43.58&swLng=-79.64&zoom=11";
const gtaAreaPayload = { neLat: 43.855, neLng: -79.12, swLat: 43.58, swLng: -79.64 };

const SPLASH_CACHE_KEY = 'tourit_splash_listings';
const SPLASH_CACHE_TTL = 60 * 60 * 1000; // 1 hour

function readSplashCache() {
	try {
		const raw = localStorage.getItem(SPLASH_CACHE_KEY);
		if (!raw) return null;
		const { listings, ts } = JSON.parse(raw);
		if (Array.isArray(listings) && listings.length && Date.now() - ts < SPLASH_CACHE_TTL) {
			return listings;
		}
	} catch {}
	return null;
}

function writeSplashCache(listings) {
	try {
		localStorage.setItem(SPLASH_CACHE_KEY, JSON.stringify({ listings, ts: Date.now() }));
	} catch {}
}

const Splash = () => {
	const history = useHistory();

	const [search, setSearch] = useState("");
	const [predictions, setPredictions] = useState([]);
	const [listings, setListings] = useState([]);
	const [activePredIdx, setActivePredIdx] = useState(-1);
	const [newlyListed, setNewlyListed] = useState(() => readSplashCache() || []);
	const [mapCenter, setMapCenter] = useState(TORONTO);
	const [over, setOver] = useState({ id: 0 });
	const [placeholder, setPlaceholder] = useState("Enter an address, city, or postal code");

	const autocompleteRef = useRef(null);
	const placesRef = useRef(null);
	const sessionTokenRef = useRef(null);
	const inputRef = useRef(null);
	const searchRef = useRef("");
	const suggestTimer = useRef(null);

	// Load Google Places API
	useEffect(() => {
		const apiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
		if (!apiKey) return;
		const loader = new Loader({ apiKey, version: "weekly", libraries: ["geometry", "places"] });
		loader.load().then(() => {
			autocompleteRef.current = new window.google.maps.places.AutocompleteService();
			const div = document.createElement("div");
			placesRef.current = new window.google.maps.places.PlacesService(div);
			sessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
		}).catch(console.error);
	}, []);

	// Pre-load address index so listing cards are instant when user types.
	useEffect(() => {
		ensureAddrIndex().then(() => {
			if (searchRef.current.trim().length >= 2) {
				setListings(searchAddr(searchRef.current));
			}
		}).catch(() => {});
	}, []);

	// Fetch map preview listings (cache-first: paint instantly, refresh in background)
	useEffect(() => {
		apiFetch("/api/listings?view=map", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ ...gtaAreaPayload, limit: 200 }),
		})
			.then((res) => res.json())
			.then((res) => {
				const fresh = res.listings || [];
				if (fresh.length) {
					setNewlyListed(fresh);
					writeSplashCache(fresh);
				}
			})
			.catch(console.error);
	}, []);

	useEffect(() => {
		if (newlyListed.length) {
			const latArr = newlyListed.map((p) => p.lat);
			const lngArr = newlyListed.map((p) => p.lng);
			setMapCenter({
				lat: latArr.reduce((a, b) => a + b) / latArr.length,
				lng: lngArr.reduce((a, b) => a + b) / lngArr.length,
			});
		} else {
			setMapCenter(TORONTO);
		}
	}, [newlyListed]);

	const fetchPredictions = (value) => {
		if (!value.trim() || !autocompleteRef.current) { setPredictions([]); return; }
		const gtaBounds = new window.google.maps.LatLngBounds(
			{ lat: 43.2, lng: -80.5 },
			{ lat: 44.3, lng: -78.5 }
		);
		autocompleteRef.current.getPlacePredictions(
			{
				input: value,
				componentRestrictions: { country: "ca" },
				bounds: gtaBounds,
				sessionToken: sessionTokenRef.current,
			},
			(results, status) => {
				if (status === window.google.maps.places.PlacesServiceStatus.OK && results) {
					setPredictions(results);
				} else {
					setPredictions([]);
				}
				setActivePredIdx(-1);
			}
		);
	};

	const selectListing = (listing) => {
		setSearch("");
		setPredictions([]);
		setListings([]);
		history.push(`/listing/${encodeURIComponent(listing.mls_number)}`);
	};

	const handleChange = (e) => {
		const val = e.target.value;
		setSearch(val);
		searchRef.current = val;
		fetchPredictions(val);
		const local = searchAddr(val);
		setListings(local);

		clearTimeout(suggestTimer.current);
		if (local.length === 0 && val.trim().length >= 2) {
			suggestTimer.current = setTimeout(() => {
				if (searchRef.current !== val) return;
				apiFetch(`/api/listings/suggest?q=${encodeURIComponent(val)}`)
					.then(r => r.json())
					.then(data => {
						if (searchRef.current === val && data.index?.length) {
							const numMatch = val.trim().match(/^\d+/);
							const target = numMatch ? parseInt(numMatch[0], 10) : null;
							const sorted = target !== null
								? [...data.index].sort((a, b) =>
									Math.abs((parseInt(a.street, 10) || 0) - target) -
									Math.abs((parseInt(b.street, 10) || 0) - target))
								: data.index;
							setListings(sorted);
						}
					})
					.catch(() => {});
			}, 350);
		}
	};

	const selectPrediction = (prediction) => {
		setSearch(prediction.description);
		setPredictions([]);
		placesRef.current.getDetails(
			{ placeId: prediction.place_id, fields: ["geometry", "types"], sessionToken: sessionTokenRef.current },
			(place, status) => {
				sessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
				if (status !== window.google.maps.places.PlacesServiceStatus.OK || !place?.geometry) return;
				history.push(toAreaURL(place));
			}
		);
	};

	const handleKeyDown = (e) => {
		if (!predictions.length) return;
		if (e.key === "ArrowDown") {
			e.preventDefault();
			setActivePredIdx((i) => Math.min(i + 1, predictions.length - 1));
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			setActivePredIdx((i) => Math.max(i - 1, -1));
		} else if (e.key === "Enter") {
			e.preventDefault();
			if (activePredIdx >= 0) {
				selectPrediction(predictions[activePredIdx]);
			} else if (predictions[0]) {
				selectPrediction(predictions[0]);
			}
		} else if (e.key === "Escape") {
			setPredictions([]);
		}
	};

	const handleSubmit = (e) => {
		e.preventDefault();
		if (predictions.length) {
			selectPrediction(predictions[activePredIdx >= 0 ? activePredIdx : 0]);
		} else if (search.trim()) {
			history.push(`/search/${search.trim().split(" ").join("-")}`);
		} else {
			history.push(defaultGtaArea);
		}
	};

	const sidebarArr = newlyListed.slice(0, 100);

	const googleMapURL = useMemo(() => {
		const apiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
		return `https://maps.googleapis.com/maps/api/js?key=${apiKey}&v=weekly&libraries=geometry,drawing,places`;
	}, []);

	return (
		<>
			<main className="splash-ctrl">
				<section className="splash-search-wrap">
					<div className="splash-hero-head">
						<p className="splash-kicker">Every Home Tour, Just a Click Away.</p>
						<h1 className="splash-search-title">
							Find your next property with calm, data-backed clarity.
						</h1>
						<p className="splash-subtitle">
							Search live inventory, scan map movement in real time, and book
							showings without friction.
						</p>
					</div>

					<form className="splash-search-panel" onSubmit={handleSubmit} autoComplete="off">
						<label className="search-label" style={{ position: "relative" }}>
							<Search size={18} strokeWidth={1.5} className="search-icon" />
							<input
								ref={inputRef}
								type="text"
								className="search-input"
								placeholder={placeholder}
								value={search}
								onChange={handleChange}
								onKeyDown={handleKeyDown}
								onFocus={() => setPlaceholder('Don\'t know where to start? Try "Toronto"')}
								onBlur={() => {
									setPlaceholder("Enter an address, city, or postal code");
									setTimeout(() => { setPredictions([]); setListings([]); }, 160);
								}}
							/>
							{(predictions.length > 0 || listings.length > 0) && (
								<div className="search-dd">
									{listings.length > 0 && (
										<>
											<div style={{
												padding: "5px 14px 3px",
												fontSize: 11, fontWeight: 600, color: "#94a3b8",
												textTransform: "uppercase", letterSpacing: "0.06em",
												borderBottom: "1px solid #f0f0ec",
											}}>Listings</div>
											{listings.map((listing) => {
												const img = resolveUrl(listing.front_img || listing.image_url);
												const isLease = (listing.transaction_type || "").toLowerCase().includes("lease");
												const unit = listing.unit ? `${listing.unit}-` : "";
												const addr = [unit + listing.street, listing.city].filter(Boolean).join(", ");
												const price = listing.price
													? `$${Number(listing.price).toLocaleString()}`
													: null;
												return (
													<div
														key={listing.id || listing.mls_number}
														className="div"
														onMouseDown={() => selectListing(listing)}
														style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px" }}
													>
														<div style={{
															width: 52, height: 38, borderRadius: 6,
															overflow: "hidden", flexShrink: 0, background: "#f0f0ec",
														}}>
															{img && (
																<img src={img} alt="" loading="lazy"
																	style={{ width: "100%", height: "100%", objectFit: "cover" }}
																	onError={(e) => { e.currentTarget.style.display = "none"; }}
																/>
															)}
														</div>
														<div style={{ flex: 1, minWidth: 0 }}>
															<div style={{ display: "flex", justifyContent: "space-between", gap: 4 }}>
																{price && <span style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{price}</span>}
																<span style={{ fontSize: 11, color: isLease ? "#16a34a" : "#2563eb", flexShrink: 0 }}>
																	{isLease ? "For Lease" : "For Sale"}
																</span>
															</div>
															<div style={{ fontSize: 12, color: "#475569", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
																{addr}
															</div>
															<div style={{ fontSize: 11, color: "#94a3b8" }}>
																{listing.category || listing.type || ""}
																{listing.bed ? ` · ${listing.bed} bd` : ""}
																{listing.bath ? ` · ${listing.bath} ba` : ""}
															</div>
														</div>
													</div>
												);
											})}
										</>
									)}
									{predictions.length > 0 && (
										<>
											{listings.length > 0 && (
												<div style={{
													padding: "5px 14px 3px",
													fontSize: 11, fontWeight: 600, color: "#94a3b8",
													textTransform: "uppercase", letterSpacing: "0.06em",
													borderTop: "1px solid #f0f0ec", borderBottom: "1px solid #f0f0ec",
												}}>Locations</div>
											)}
											{predictions.map((pred, i) => (
												<div
													key={pred.place_id}
													className={`div${i === activePredIdx ? " active" : ""}`}
													onMouseDown={() => selectPrediction(pred)}
												>
													<MapPin size={14} strokeWidth={1.5} style={{ flexShrink: 0, color: "#94a3b8" }} />
													<div className="term">
														<span style={{ fontWeight: 500 }}>
															{pred.structured_formatting?.main_text}
														</span>
														{pred.structured_formatting?.secondary_text && (
															<span style={{ color: "#94a3b8", marginLeft: 4, fontWeight: 400 }}>
																{pred.structured_formatting.secondary_text}
															</span>
														)}
													</div>
												</div>
											))}
										</>
									)}
								</div>
							)}
						</label>
						<div className="splash-actions">
							<button type="button" className="splash-btn splash-btn-ghost">
								<SlidersHorizontal size={16} strokeWidth={1.5} />
								Filters
							</button>
							<button type="submit" className="splash-btn splash-btn-primary">
								Start Search
								<ArrowRight size={16} strokeWidth={1.5} />
							</button>
						</div>
					</form>

					<div className="splash-metrics">
						<div className="splash-metric-card">
							<TrendingUp size={16} strokeWidth={1.5} />
							<span>Live pricing movements</span>
						</div>
						<div className="splash-metric-card">
							<MapPin size={16} strokeWidth={1.5} />
							<span>Map-linked inventory feed</span>
						</div>
						<div className="splash-metric-card">
							<Bookmark size={16} strokeWidth={1.5} />
							<span>Save & compare instantly</span>
						</div>
					</div>
				</section>

				<section className="splash-map-section">
					<div className="search-pg-ctrl splash-map-grid">
						<MyMap
							isMarkerShown
							googleMapURL={googleMapURL}
							loadingElement={<div style={{ height: `100%` }} />}
							containerElement={<div className="map-ctnr" />}
							mapElement={<div style={{ height: `100%` }} />}
							markers={newlyListed}
							center={mapCenter}
							zoom={10}
							over={over}
							enableAreaSearch={false}
						/>
						<List
							min={0}
							setMin={() => {}}
							max={99999999999}
							setMax={() => {}}
							type=""
							setType={() => {}}
							bed={0}
							setBed={() => {}}
							bath={0}
							setBath={() => {}}
							propArr={sidebarArr}
							setOver={setOver}
							url={defaultGtaArea}
							showMapAreaButton={false}
							compactMode
						/>
					</div>
				</section>
			</main>
			<Footer />
		</>
	);
};

export default Splash;
