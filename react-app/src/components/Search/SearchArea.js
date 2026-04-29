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

	// state.properties is a flat { [id]: property } object — do NOT chain .properties
	const properties = useSelector((state) => state.properties?.properties ?? []);

	const [min, setMin] = useState(0);
	const [max, setMax] = useState(99999999999);
	const [type, setType] = useState("");
	const [bed, setBed] = useState(0);
	const [bath, setBath] = useState(0);
	const [transactionType, setTransactionType] = useState("sale"); // "sale" | "lease"

	const getInitialCenter = (param) => {
		if (!param) return TORONTO;
		const parts = param.split("&").map((p) => parseFloat(p.split("=")[1]));
		const [neLat, neLng, swLat, swLng] = parts;
		return { lat: (neLat + swLat) / 2, lng: (neLng + swLng) / 2 };
	};

	const [center] = useState(() => getInitialCenter(areaParam));
	const mapFlyToRef = useRef(null); // set by Map via onMapReady
	const [showConsent, setShowConsent] = useState(false);
	const [propArr, setPropArr] = useState([]);
	const [over, setOver] = useState({ id: 0 });
	const [zoom, setZoom] = useState(10);
	const [isMapSyncing, setIsMapSyncing] = useState(false);
	const mapSyncTimer = useRef(null);

	// Show consent banner once on mount if not yet accepted
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

	const handleAccept = () => {
		saveConsent();
		setShowConsent(false);
		requestLocation();
	};

	const handleDecline = () => {
		setShowConsent(false);
	};

	useEffect(() => {
		if (areaParam) {
			const [neLat, neLng, swLat, swLng, zoomStr] = areaParam
				.split("&")
				.map((each) => each.split("=")[1]);
			const payload = { neLat, neLng, swLat, swLng };
			dispatch(propertyActions.areaProperties(payload));
			setZoom(parseInt(zoomStr, 10));
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
				const tt = (prop?.transaction_type || prop?.status || "").toLowerCase();
				if (transactionType === "lease") return tt.includes("lease");
				return !tt.includes("lease");
			});
		setPropArr(arr);
		}, [min, max, type, bed, bath, transactionType, properties]);
	const sidebarArr = propArr.slice(0, 100);

	useEffect(() => {
		return () => {
			if (mapSyncTimer.current) clearTimeout(mapSyncTimer.current);
		};
	}, []);

	// useCallback keeps the reference stable so MyMap doesn't re-register its
	// onIdle listener on every render — that re-registration was the infinite loop.
	// setIsMapSyncing(true) is inside the timeout, not before it, to avoid a
	// synchronous state update that would trigger an extra render before fetch.
	const handleMapBoundsChange = useCallback((bounds) => {
		if (!bounds) return;
		if (mapSyncTimer.current) clearTimeout(mapSyncTimer.current);
		mapSyncTimer.current = setTimeout(async () => {
			setIsMapSyncing(true);
			await dispatch(propertyActions.areaProperties(bounds));
			setIsMapSyncing(false);
		}, 500);
	}, [dispatch]);

	const apiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
	const googleMapURL = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&v=3.exp&libraries=geometry,drawing,places&loading=async`;

	return (
		<div className="search-pg-wrap">
			<main className="search-pg-ctrl bg-[#f3f3f1]">
				<MyMap
					isMarkerShown
					googleMapURL={googleMapURL}
					loadingElement={<div style={{ height: `100%` }} />}
					containerElement={<div className="map-ctnr relative overflow-hidden border-r border-[#dcdcd7]" />}
					mapElement={<div style={{ height: `100%` }} />}
					markers={propArr}
					center={center}
					over={over}
					zoom={zoom}
					onBoundsChange={handleMapBoundsChange}
					onMapReady={(fn) => { mapFlyToRef.current = fn; }}
					enableAreaSearch={false}
					syncCenter={false}
					transactionType={transactionType}
					setTransactionType={setTransactionType}
				/>
				<List
					min={min}
					setMin={setMin}
					max={max}
					setMax={setMax}
					type={type}
					setType={setType}
					bed={bed}
					setBed={setBed}
					bath={bath}
					setBath={setBath}
					propArr={sidebarArr}
					setOver={setOver}
					showMapAreaButton={false}
					isMapSyncing={isMapSyncing}
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
