import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";

import List from "./List";
import MyMap from "./Map";
import MapSearchBar from "./Map/MapSearchBar";
import LocationConsent from "../LocationConsent";

import * as propertyActions from "../../store/property";
import { hasConsented, saveConsent } from "../../utils/locationConsent";

const TORONTO = { lat: 43.6532, lng: -79.3832 };

const SearchArea = () => {
	const dispatch = useDispatch();
	const { areaParam } = useParams();
	// Fallback listings while pin index is loading
	const fallbackProps = useSelector((state) => state.properties?.properties ?? []);

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
	const [showFilters, setShowFilters] = useState(false);

	const getInitialCenter = (param) => {
		if (!param) return TORONTO;
		const parts = param.split("&").map((p) => parseFloat(p.split("=")[1]));
		const [neLat, neLng, swLat, swLng] = parts;
		return { lat: (neLat + swLat) / 2, lng: (neLng + swLng) / 2 };
	};

	const [center] = useState(() => getInitialCenter(areaParam));
	const mapFlyToRef = useRef(null);
	const flyTargetRef = useRef(null);
	const flyTargetTimerRef = useRef(null);
	const [mapIsReady, setMapIsReady] = useState(false);
	const [showConsent, setShowConsent] = useState(false);
	const [pinIndex, setPinIndex] = useState([]);
	const [mapBounds, setMapBounds] = useState(null);
	const [over, setOver] = useState({ id: 0 });
	const [zoom, setZoom] = useState(10);
	const mapSyncTimer = useRef(null);
	const transactionTypeRef = useRef("For Sale");

	useEffect(() => {
		if (!hasConsented()) setShowConsent(true);
	}, []);

	const handleAccept = () => { saveConsent(); setShowConsent(false); requestLocation(); };
	const handleDecline = () => setShowConsent(false);

	const requestLocation = () => {
		if (!navigator.geolocation) return;
		navigator.geolocation.getCurrentPosition(
			(pos) => mapFlyToRef.current?.(pos.coords.latitude, pos.coords.longitude),
			() => mapFlyToRef.current?.(TORONTO.lat, TORONTO.lng),
			{ timeout: 8000 }
		);
	};

	useEffect(() => {
		if (areaParam) {
			const parts = areaParam.split("&").map((each) => parseFloat(each.split("=")[1]));
			const [neLat, neLng, swLat, swLng, zoomVal] = parts;
			// Fetch initial viewport data as a fallback shown before pin index arrives
			dispatch(propertyActions.areaProperties({ neLat, neLng, swLat, swLng }));
			setZoom(Math.round(zoomVal));
		}
	}, [dispatch, areaParam]);

	// Load the full pin index once — drives all map dots AND the list panel
	useEffect(() => {
		dispatch(propertyActions.fetchPinIndex()).then((pins) => {
			if (Array.isArray(pins) && pins.length) setPinIndex(pins);
		});
	}, [dispatch]); // eslint-disable-line react-hooks/exhaustive-deps

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
		if (prop?.category) return prop.category === slug;
		const txt = [prop?.style, prop?.property_type, prop?.type].filter(Boolean).join(' ');
		if (slug === 'Condo')     return /condo|apt|apartment|flat|strata/i.test(txt);
		if (slug === 'Townhouse') return /townhouse|town.?house|row/i.test(txt);
		if (slug === 'House')     return !(/condo|apt|apartment|flat|strata|townhouse|town.?house|row/i.test(txt));
		return false;
	};

	// All GTA listings matching current filters — fed to Map for pin rendering.
	// Falls back to the initial bounds query results while pin index is loading.
	const filteredPins = useMemo(() => {
		const src = pinIndex.length ? pinIndex : fallbackProps;
		return src
			.filter((p) => p.price > min && p.price < max)
			.filter((p) => matchesType(p, type))
			.filter((p) => {
				if (bed === 0) return true;
				const b = parseInt(p.bed, 10) || 0;
				if (bed === -1) return b === 0;
				if (bed >= 5)   return b >= 5;
				return b === bed;
			})
			.filter((p) => bath === 0 || p.bath >= bath || p.bath + 0.5 >= bath)
			.filter((p) => {
				const tt = (p.transaction_type || "").toLowerCase();
				if (transactionType === "For Lease") return tt.includes("lease");
				return !tt.includes("lease");
			})
			.filter((p) => sqftMin === 0 || (p.sqft != null && p.sqft >= sqftMin))
			.filter((p) => sqftMax >= 999999 || (p.sqft != null && p.sqft <= sqftMax));
	}, [pinIndex, fallbackProps, min, max, type, bed, bath, transactionType, sqftMin, sqftMax]); // eslint-disable-line react-hooks/exhaustive-deps

	// Sidebar list: filteredPins clipped to current viewport — no server limit
	const sidebarArr = useMemo(() => {
		if (!mapBounds) return [];
		const { swLat, neLat, swLng, neLng } = mapBounds;
		return filteredPins.filter(
			(p) => p.lat >= swLat && p.lat <= neLat && p.lng >= swLng && p.lng <= neLng
		);
	}, [filteredPins, mapBounds]);

	// After a fly-to, highlight the nearest listing to the searched point (if within ~150 m)
	useEffect(() => {
		if (!flyTargetRef.current || !filteredPins.length) return;
		const { lat, lng } = flyTargetRef.current;
		let nearest = null;
		let minDist = Infinity;
		for (const p of filteredPins) {
			if (p.lat == null || p.lng == null) continue;
			const d = Math.sqrt((p.lat - lat) ** 2 + (p.lng - lng) ** 2);
			if (d < minDist) { minDist = d; nearest = p; }
		}
		if (nearest && minDist < 0.0015) {
			setOver({ id: nearest.id });
			flyTargetRef.current = null;
			if (flyTargetTimerRef.current) clearTimeout(flyTargetTimerRef.current);
		}
	}, [filteredPins]);

	const handleMapBoundsChange = useCallback((bounds) => {
		if (!bounds) return;
		setMapBounds(bounds);
		// Always re-fetch on pan — provides fallback data when pin index hasn't loaded.
		// When pin index is loaded, fallbackProps is ignored and has no visible effect.
		if (mapSyncTimer.current) clearTimeout(mapSyncTimer.current);
		mapSyncTimer.current = setTimeout(() => {
			dispatch(propertyActions.areaProperties({
				...bounds,
				transaction_type: transactionTypeRef.current,
			}));
		}, 500);
	}, [dispatch]);

	const handleFlyTo = (lat, lng, bounds) => {
		if (flyTargetTimerRef.current) clearTimeout(flyTargetTimerRef.current);
		flyTargetRef.current = { lat, lng };
		setOver({ id: 0 });
		mapFlyToRef.current?.(lat, lng, bounds);
		flyTargetTimerRef.current = setTimeout(() => { flyTargetRef.current = null; }, 6000);
	};

	const apiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
	const googleMapURL = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&v=weekly&libraries=geometry,drawing,places`;

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
					<div className="flex flex-wrap sm:flex-nowrap items-center gap-2 shrink-0 relative z-20 bg-white border-b border-[#e5e5e0]" style={{ padding: "8px 10px" }}>
						<div className="order-1 sm:order-2 w-full sm:w-auto sm:flex-1 relative z-30">
							<MapSearchBar
								onPlaceSelect={handleFlyTo}
								googleReady={mapIsReady}
							/>
						</div>

						<div className="order-2 sm:order-1" style={{
							display: "flex", borderRadius: 8, overflow: "hidden",
							border: "1px solid #d6d6d0", flexShrink: 0, height: 36,
						}}>
							<button
								type="button"
								onClick={() => { setTransactionType("For Sale"); transactionTypeRef.current = "For Sale"; }}
								style={{
									...btnBase,
									background: transactionType === "For Sale" ? "#0f172a" : "white",
									color: transactionType === "For Sale" ? "white" : "#374151",
								}}
							>Buy</button>
							<button
								type="button"
								onClick={() => { setTransactionType("For Lease"); transactionTypeRef.current = "For Lease"; }}
								style={{
									...btnBase,
									background: transactionType === "For Lease" ? "#0f172a" : "white",
									color: transactionType === "For Lease" ? "white" : "#374151",
									borderLeft: "1px solid #d6d6d0",
								}}
							>Rent</button>
						</div>

						<button
							type="button"
							className="order-3 sm:order-3"
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
							markers={filteredPins}
							center={center}
							over={over}
							zoom={zoom}
							onBoundsChange={handleMapBoundsChange}
							onMapReady={(fn) => { mapFlyToRef.current = fn; setMapIsReady(true); }}
							onOverClear={() => setOver({ id: 0 })}
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
					isMapSyncing={false}
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
