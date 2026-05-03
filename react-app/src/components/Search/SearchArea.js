import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";

import List from "./List";
import MyMap from "./Map";
import LocationConsent from "../LocationConsent";

import * as propertyActions from "../../store/property";
import { hasConsented, saveConsent } from "../../utils/locationConsent";
import { useNotification } from "../../context/Notification";

const TORONTO = { lat: 43.6532, lng: -79.3832 };
const GTA_BOUNDS_OBJ = { south: 43.2, west: -80.5, north: 44.3, east: -78.5 };

const SearchArea = () => {
	const dispatch = useDispatch();
	const { areaParam } = useParams();
	const { setToggleNotification, setNotificationMsg } = useNotification();

	const properties = useSelector((state) => state.properties?.properties ?? []);

	const [min, setMin] = useState(0);
	const [max, setMax] = useState(99999999999);
	const [type, setType] = useState("");
	const [bed, setBed] = useState(0);
	const [bath, setBath] = useState(0);
	const [sqftMin, setSqftMin] = useState(0);
	const [sqftMax, setSqftMax] = useState(999999);
	const [strataMin, setStrataMin] = useState(0);
	const [strataMax, setStrataMax] = useState(999999);
	const [titleStatus, setTitleStatus] = useState("");
	const [transactionType, setTransactionType] = useState("For Sale");
	const transactionTypeRef = useRef("For Sale");
	const boundsRef = useRef(null);
	const [showFilters, setShowFilters] = useState(false);

	const getInitialCenter = (param) => {
		if (!param) return TORONTO;
		const parts = param.split("&").map((p) => parseFloat(p.split("=")[1]));
		const [neLat, neLng, swLat, swLng] = parts;
		return { lat: (neLat + swLat) / 2, lng: (neLng + swLng) / 2 };
	};

	const [center] = useState(() => getInitialCenter(areaParam));
	const mapFlyToRef = useRef(null);
	const searchInputRef = useRef(null);
	const autocompleteServiceRef = useRef(null);
	const placesServiceRef = useRef(null);
	const sessionTokenRef = useRef(null);
	const gtaBoundsRef = useRef(null);
	const [mapIsReady, setMapIsReady] = useState(false);
	const [showConsent, setShowConsent] = useState(false);
	const [propArr, setPropArr] = useState([]);
	const [over, setOver] = useState({ id: 0 });
	const [zoom, setZoom] = useState(10);
	const [isMapSyncing, setIsMapSyncing] = useState(false);
	const mapSyncTimer = useRef(null);

	useEffect(() => {
		if (!hasConsented()) setShowConsent(true);
	}, []);

	const requestLocation = () => {
		if (!navigator.geolocation) return;
		navigator.geolocation.getCurrentPosition(
			(pos) => mapFlyToRef.current?.(pos.coords.latitude, pos.coords.longitude),
			() => mapFlyToRef.current?.(TORONTO.lat, TORONTO.lng),
			{ timeout: 8000 }
		);
	};

	const handleAccept = () => { saveConsent(); setShowConsent(false); requestLocation(); };
	const handleDecline = () => setShowConsent(false);

	useEffect(() => {
		if (areaParam) {
			const parts = areaParam.split("&").map((each) => parseFloat(each.split("=")[1]));
			const [neLat, neLng, swLat, swLng, zoomVal] = parts;
			dispatch(propertyActions.areaProperties({ neLat, neLng, swLat, swLng }));
			setZoom(Math.round(zoomVal));
		}
	}, [dispatch, areaParam]);

	useEffect(() => {
		document.documentElement.classList.add("search-page-lock");
		document.body.classList.add("search-page-lock");
		return () => {
			document.documentElement.classList.remove("search-page-lock");
			document.body.classList.remove("search-page-lock");
		};
	}, []);

	const matchesType = (prop, slug) => {
		if (!slug) return true;
		const t = ((prop?.type || "") + " " + (prop?.property_type || "")).toLowerCase();
		if (slug === "condo")     return t.includes("condo") || t.includes("condominium");
		if (slug === "townhouse") return t.includes("townhouse") || t.includes("town house");
		if (slug === "multi")     return t.includes("multi") || t.includes("duplex") || t.includes("triplex");
		if (slug === "house")     return t.includes("single family") || t.includes("detached") || (t.includes("residential") && !t.includes("condo"));
		return t.includes(slug);
	};

	const matchesTitle = (ownershipType, slug) => {
		if (!slug) return true;
		const t = (ownershipType || "").toLowerCase();
		if (!t) return false;
		if (slug === "freehold")  return t.includes("freehold");
		if (slug === "leasehold") return t.includes("leasehold");
		if (slug === "strata")    return t.includes("strata") || t.includes("condo");
		if (slug === "co-op")     return t.includes("co-op") || t.includes("co op") || t.includes("cooperat");
		return false;
	};

	useEffect(() => {
		const arr = (Array.isArray(properties) ? properties : [])
			.filter((prop) => prop?.price > min)
			.filter((prop) => prop?.price < max)
			.filter((prop) => matchesType(prop, type))
			.filter((prop) => {
				if (bed === 0)  return true;
				if (bed === -1) return prop?.bed === 0;
				return prop?.bed >= bed;
			})
			.filter((prop) => {
				if (bath === 0) return true;
				return prop?.bath >= bath || prop?.bath + 0.5 >= bath;
			})
			.filter((prop) => {
				const tt = (prop?.transaction_type || "").toLowerCase();
				if (transactionType === "For Lease") return tt.includes("lease");
				return !tt.includes("lease");
			})
			.filter((prop) => sqftMin === 0 || (prop?.sqft != null && prop.sqft >= sqftMin))
			.filter((prop) => sqftMax >= 999999 || (prop?.sqft != null && prop.sqft <= sqftMax))
			.filter((prop) => strataMin === 0 || (prop?.association_fee != null && prop.association_fee >= strataMin))
			.filter((prop) => strataMax >= 999999 || prop?.association_fee == null || prop.association_fee <= strataMax)
			.filter((prop) => matchesTitle(prop?.ownership_type, titleStatus));
		setPropArr(arr);
	}, [min, max, type, bed, bath, transactionType, sqftMin, sqftMax, strataMin, strataMax, titleStatus, properties]); // eslint-disable-line react-hooks/exhaustive-deps

	const sidebarArr = propArr.slice(0, 100);

	useEffect(() => {
		return () => { if (mapSyncTimer.current) clearTimeout(mapSyncTimer.current); };
	}, []);

	const fetchFromMap = useCallback((bounds, tType) => {
		if (!bounds) return;
		if (mapSyncTimer.current) clearTimeout(mapSyncTimer.current);
		mapSyncTimer.current = setTimeout(async () => {
			setIsMapSyncing(true);
			await dispatch(propertyActions.areaProperties({ ...bounds, transaction_type: tType }));
			setIsMapSyncing(false);
		}, 500);
	}, [dispatch]);

	const handleMapBoundsChange = useCallback((bounds) => {
		if (!bounds) return;
		boundsRef.current = bounds;
		fetchFromMap(bounds, transactionTypeRef.current);
	}, [fetchFromMap]);

	const handleTransactionTypeChange = (newType) => {
		setTransactionType(newType);
		transactionTypeRef.current = newType;
		fetchFromMap(boundsRef.current, newType);
	};

	// Init Places services once map/Google API is ready
	useEffect(() => {
		if (!mapIsReady || !searchInputRef.current || !window.google?.maps?.places) return;

		const gtaBounds = new window.google.maps.LatLngBounds(
			{ lat: GTA_BOUNDS_OBJ.south, lng: GTA_BOUNDS_OBJ.west },
			{ lat: GTA_BOUNDS_OBJ.north, lng: GTA_BOUNDS_OBJ.east }
		);
		gtaBoundsRef.current = gtaBounds;

		autocompleteServiceRef.current = new window.google.maps.places.AutocompleteService();
		const div = document.createElement("div");
		placesServiceRef.current = new window.google.maps.places.PlacesService(div);
		sessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();

		const autocomplete = new window.google.maps.places.Autocomplete(searchInputRef.current, {
			componentRestrictions: { country: "ca" },
			bounds: gtaBounds,
			strictBounds: false,
			fields: ["geometry", "types"],
		});

		autocomplete.addListener("place_changed", () => {
			const place = autocomplete.getPlace();
			if (!place?.geometry?.location) return;
			flyToPlace(place);
		});

		return () => window.google.maps.event.clearInstanceListeners(autocomplete);
	}, [mapIsReady]); // eslint-disable-line react-hooks/exhaustive-deps

	const flyToPlace = (place) => {
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
		mapFlyToRef.current?.(lat, lng, bounds);
	};

	// Search button: get first prediction and fly there
	const handleSearchClick = () => {
		const query = searchInputRef.current?.value?.trim();
		if (!query || !autocompleteServiceRef.current) return;
		autocompleteServiceRef.current.getPlacePredictions({
			input: query,
			componentRestrictions: { country: "ca" },
			bounds: gtaBoundsRef.current,
			sessionToken: sessionTokenRef.current,
		}, (results, status) => {
			if (status !== window.google.maps.places.PlacesServiceStatus.OK || !results?.length) return;
			placesServiceRef.current.getDetails({
				placeId: results[0].place_id,
				fields: ["geometry", "types"],
				sessionToken: sessionTokenRef.current,
			}, (place, detailStatus) => {
				sessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
				if (detailStatus !== window.google.maps.places.PlacesServiceStatus.OK || !place?.geometry) return;
				flyToPlace(place);
			});
		});
	};

	const apiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
	const googleMapURL = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&v=3.exp&libraries=geometry,drawing,places&loading=async`;

	const btnBase = {
		padding: "0 16px", fontSize: 13, fontWeight: 600,
		border: "none", cursor: "pointer", height: "100%",
	};

	return (
		<div className="search-pg-wrap">
			<main className="search-pg-ctrl bg-[#f3f3f1]">
				{/* Map column */}
				<div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
					{/* Search bar row */}
					<div style={{
						display: "flex", alignItems: "center", gap: 8,
						padding: "8px 10px", background: "white",
						borderBottom: "1px solid #e5e5e0", flexShrink: 0,
						position: "relative", zIndex: 20,
					}}>
						{/* Buy / Rent toggle */}
						<div style={{
							display: "flex", borderRadius: 8, overflow: "hidden",
							border: "1px solid #d6d6d0", flexShrink: 0, height: 36,
						}}>
							<button
								type="button"
								onClick={() => handleTransactionTypeChange("For Sale")}
								style={{
									...btnBase,
									background: transactionType === "For Sale" ? "#0f172a" : "white",
									color: transactionType === "For Sale" ? "white" : "#374151",
								}}
							>Buy</button>
							<button
								type="button"
								onClick={() => handleTransactionTypeChange("For Lease")}
								style={{
									...btnBase,
									background: transactionType === "For Lease" ? "#0f172a" : "white",
									color: transactionType === "For Lease" ? "white" : "#374151",
									borderLeft: "1px solid #d6d6d0",
								}}
							>Rent</button>
						</div>

						{/* Search input + magnifying glass button */}
						<div style={{
							flex: 1, display: "flex", alignItems: "center",
							border: "1px solid #d6d6d0", borderRadius: 8,
							background: "white", overflow: "hidden", height: 36,
						}}>
							<input
								ref={searchInputRef}
								type="text"
								placeholder="City, neighbourhood, or address…"
								style={{
									flex: 1, border: "none", outline: "none",
									padding: "0 12px", fontSize: 13, color: "#0f172a",
									background: "transparent", height: "100%",
								}}
							/>
							<button
								type="button"
								onClick={handleSearchClick}
								style={{
									padding: "0 12px", background: "none", border: "none",
									borderLeft: "1px solid #e5e5e0", cursor: "pointer",
									color: "#6b7280", height: "100%", display: "flex",
									alignItems: "center",
								}}
							>
								<i className="fa-solid fa-magnifying-glass" style={{ fontSize: 13 }} />
							</button>
						</div>

						{/* Filter button */}
						<button
							type="button"
							onClick={() => setShowFilters(true)}
							style={{
								...btnBase, height: 36,
								background: "white", color: "#2d2d2d",
								border: "1px solid #d6d6d0", borderRadius: 8,
								display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
							}}
						>
							<i className="fa-solid fa-sliders" style={{ fontSize: 12 }} />
							Filter
						</button>
					</div>

					{/* Map */}
					<div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
						<MyMap
							isMarkerShown
							googleMapURL={googleMapURL}
							loadingElement={<div style={{ height: "100%" }} />}
							containerElement={<div className="map-ctnr relative overflow-hidden border-r border-[#dcdcd7]" />}
							mapElement={<div style={{ height: "100%" }} />}
							markers={propArr}
							center={center}
							over={over}
							zoom={zoom}
							onBoundsChange={handleMapBoundsChange}
							onMapReady={(fn) => { mapFlyToRef.current = fn; setMapIsReady(true); }}
							enableAreaSearch={false}
							syncCenter={false}
						/>
					</div>
				</div>

				<List
					min={min} setMin={setMin}
					max={max} setMax={setMax}
					type={type} setType={setType}
					bed={bed} setBed={setBed}
					bath={bath} setBath={setBath}
					sqftMin={sqftMin} setSqftMin={setSqftMin}
					sqftMax={sqftMax} setSqftMax={setSqftMax}
					strataMin={strataMin} setStrataMin={setStrataMin}
					strataMax={strataMax} setStrataMax={setStrataMax}
					titleStatus={titleStatus} setTitleStatus={setTitleStatus}
					transactionType={transactionType}
					propArr={sidebarArr}
					setOver={setOver}
					showMapAreaButton={false}
					isMapSyncing={isMapSyncing}
					hideSearch={true}
					showFilters={showFilters}
					setShowFilters={setShowFilters}
				/>
			</main>
			{showConsent && (
				<LocationConsent onAccept={handleAccept} onDecline={handleDecline} />
			)}
			<footer className="search-pg-footer">
				<p>The information provided herein is deemed reliable but is not guaranteed accurate by PROPTX.</p>
				<p>The information provided herein must only be used by consumers that have a bona fide interest in the purchase, sale, or lease of real estate and may not be used for any commercial purpose or any other purpose.</p>
			</footer>
		</div>
	);
};

export default SearchArea;
