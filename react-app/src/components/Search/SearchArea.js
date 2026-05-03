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
	const [transactionType, setTransactionType] = useState("For Sale");
	const transactionTypeRef = useRef("For Sale");
	const boundsRef = useRef(null);

	const getInitialCenter = (param) => {
		if (!param) return TORONTO;
		const parts = param.split("&").map((p) => parseFloat(p.split("=")[1]));
		const [neLat, neLng, swLat, swLng] = parts;
		return { lat: (neLat + swLat) / 2, lng: (neLng + swLng) / 2 };
	};

	const [center] = useState(() => getInitialCenter(areaParam));
	const mapFlyToRef = useRef(null);
	const searchInputRef = useRef(null);
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

	useEffect(() => {
		const arr = (Array.isArray(properties) ? properties : [])
			.filter((prop) => prop?.price > min)
			.filter((prop) => prop?.price < max)
			.filter((prop) => !type || prop?.type?.includes(type))
			.filter((prop) => {
				if (bed === 0)  return true;
				if (bed === -1) return prop?.bed === 0;
				if (bed >= 5)   return prop?.bed >= 5;
				return prop?.bed === bed;
			})
			.filter((prop) => {
				if (bath === 0) return true;
				return prop?.bath >= bath || prop?.bath + 0.5 >= bath;
			})
			.filter((prop) => {
				const tt = (prop?.transaction_type || "").toLowerCase();
				if (transactionType === "For Lease") return tt.includes("lease");
				return !tt.includes("lease");
			});
		setPropArr(arr);
	}, [min, max, type, bed, bath, transactionType, properties]);

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

	// Wire Google Places Autocomplete to the search input once the map (and Google API) is ready
	useEffect(() => {
		if (!mapIsReady || !searchInputRef.current || !window.google?.maps?.places) return;

		const gtaBounds = new window.google.maps.LatLngBounds(
			{ lat: 43.2, lng: -80.5 },
			{ lat: 44.3, lng: -78.5 }
		);

		const autocomplete = new window.google.maps.places.Autocomplete(searchInputRef.current, {
			componentRestrictions: { country: "ca" },
			bounds: gtaBounds,
			strictBounds: false,
			fields: ["geometry", "types"],
		});

		autocomplete.addListener("place_changed", () => {
			const place = autocomplete.getPlace();
			if (!place?.geometry?.location) return;
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
			mapFlyToRef.current?.(lat, lng, bounds);
		});

		return () => window.google.maps.event.clearInstanceListeners(autocomplete);
	}, [mapIsReady]);

	const apiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
	const googleMapURL = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&v=3.exp&libraries=geometry,drawing,places&loading=async`;

	return (
		<div className="search-pg-wrap">
			<main className="search-pg-ctrl bg-[#f3f3f1]">
				{/* Map column: search bar on top, map fills the rest */}
				<div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
					<div style={{
						padding: "8px 10px", background: "white",
						borderBottom: "1px solid #e5e5e0", flexShrink: 0,
						position: "relative", zIndex: 20,
					}}>
						<div style={{ position: "relative" }}>
							<i className="fa-solid fa-magnifying-glass" style={{
								position: "absolute", left: 11, top: "50%",
								transform: "translateY(-50%)", color: "#94a3b8", fontSize: 13, zIndex: 1,
							}} />
							<input
								ref={searchInputRef}
								type="text"
								placeholder="City, neighbourhood, or address…"
								style={{
									width: "100%", border: "1px solid #d6d6d0", borderRadius: 8,
									padding: "8px 12px 8px 32px", fontSize: 13, outline: "none",
									color: "#0f172a", background: "white",
								}}
							/>
						</div>
					</div>
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
							transactionType={transactionType}
							setTransactionType={handleTransactionTypeChange}
						/>
					</div>
				</div>

				<List
					min={min} setMin={setMin}
					max={max} setMax={setMax}
					type={type} setType={setType}
					bed={bed} setBed={setBed}
					bath={bath} setBath={setBath}
					propArr={sidebarArr}
					setOver={setOver}
					showMapAreaButton={false}
					isMapSyncing={isMapSyncing}
					hideSearch={true}
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
