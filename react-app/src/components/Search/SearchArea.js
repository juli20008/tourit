import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";

import List from "./List";
import MyMap from "./Map";
import MapSearchBar from "./Map/MapSearchBar";
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
	const flyTargetRef = useRef(null);
	const flyTargetTimerRef = useRef(null);
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

	const matchesTitle = (ownershipType, code) => {
		if (!code) return true;
		if (!ownershipType) return false;
		return String(ownershipType) === code;
	};

	const matchesType = (prop, slug) => {
		if (!slug) return true;
		if (prop?.category) return prop.category === slug;
		const txt = [prop?.style, prop?.property_type, prop?.type].filter(Boolean).join(' ');
		if (slug === 'Condo')     return /condo|apt|apartment|flat|strata/i.test(txt);
		if (slug === 'Townhouse') return /townhouse|town.?house|row/i.test(txt);
		if (slug === 'House')     return !(/condo|apt|apartment|flat|strata|townhouse|town.?house|row/i.test(txt));
		return false;
	};

	useEffect(() => {
		const arr = (Array.isArray(properties) ? properties : [])
			.filter((prop) => prop?.price > min)
			.filter((prop) => prop?.price < max)
			.filter((prop) => matchesType(prop, type))
			.filter((prop) => {
				if (bed === 0)  return true;
				const propBed = parseInt(prop?.bed, 10) || 0;
				if (bed === -1) return propBed === 0;
				if (bed >= 5)   return propBed >= 5;
				return propBed === bed;
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

	const handleFlyTo = (lat, lng, bounds) => {
		if (flyTargetTimerRef.current) clearTimeout(flyTargetTimerRef.current);
		flyTargetRef.current = { lat, lng };
		setOver({ id: 0 });
		mapFlyToRef.current?.(lat, lng, bounds);
		// Expire the target if no nearby listing is found within 6 seconds
		flyTargetTimerRef.current = setTimeout(() => {
			flyTargetRef.current = null;
		}, 6000);
	};

	// After a fly-to, when propArr loads new listings for the area, highlight
	// the nearest listing to the searched point (if within ~150 m).
	useEffect(() => {
		if (!flyTargetRef.current || !propArr.length) return;
		const { lat, lng } = flyTargetRef.current;
		let nearest = null;
		let minDist = Infinity;
		for (const p of propArr) {
			if (p.lat == null || p.lng == null) continue;
			const d = Math.sqrt((p.lat - lat) ** 2 + (p.lng - lng) ** 2);
			if (d < minDist) { minDist = d; nearest = p; }
		}
		if (nearest && minDist < 0.0015) {
			setOver({ id: nearest.id });
			flyTargetRef.current = null;
			if (flyTargetTimerRef.current) clearTimeout(flyTargetTimerRef.current);
		}
	}, [propArr]);

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
					{/* Search bar row — stacks on smallest screens */}
					<div className="flex flex-wrap sm:flex-nowrap items-center gap-2 shrink-0 relative z-20 bg-white border-b border-[#e5e5e0]" style={{ padding: "8px 10px" }}>
						{/* Search bar — full-width row 1 on mobile, flex-1 row on desktop */}
						<div className="order-1 sm:order-2 w-full sm:w-auto sm:flex-1 relative z-30">
							<MapSearchBar
								onPlaceSelect={handleFlyTo}
								googleReady={mapIsReady}
							/>
						</div>

						{/* Buy / Rent toggle — row 2 on mobile, left side on desktop */}
						<div className="order-2 sm:order-1" style={{
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

						{/* Filter button — row 2 (right of Buy/Rent) on mobile, right side on desktop */}
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
							markers={propArr}
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
