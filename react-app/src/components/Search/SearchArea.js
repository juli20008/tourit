import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";

import List from "./List";
import MyMap from "./Map";

import * as propertyActions from "../../store/property";

const SearchArea = () => {
	const dispatch = useDispatch();
	const { areaParam } = useParams();

	// state.properties is a flat { [id]: property } object — do NOT chain .properties
	const properties = useSelector((state) => state.properties?.properties ?? []);

	const [min, setMin] = useState(0);
	const [max, setMax] = useState(99999999999);
	const [type, setType] = useState("");
	const [bed, setBed] = useState(0);
	const [bath, setBath] = useState(0);
	const [transactionType, setTransactionType] = useState("sale"); // "sale" | "lease"

	const getInitialCenter = (param) => {
		if (!param) return { lat: 37.0903, lng: -95.7129 };
		const parts = param.split("&").map((p) => parseFloat(p.split("=")[1]));
		const [neLat, neLng, swLat, swLng] = parts;
		return { lat: (neLat + swLat) / 2, lng: (neLng + swLng) / 2 };
	};

	const [center] = useState(() => getInitialCenter(areaParam));
	const [propArr, setPropArr] = useState([]);
	const [over, setOver] = useState({ id: 0 });
	const [zoom, setZoom] = useState(10);
	const [isMapSyncing, setIsMapSyncing] = useState(false);
	const mapSyncTimer = useRef(null);

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
	const googleMapURL = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&v=3.exp&libraries=geometry,drawing,places`;

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
					propArr={propArr}
					setOver={setOver}
					showMapAreaButton={false}
					isMapSyncing={isMapSyncing}
				/>
			</main>
			<footer className="search-pg-footer">
				<p>The information provided herein is deemed reliable but is not guaranteed accurate by PROPTX.</p>
				<p>The information provided herein must only be used by consumers that have a bona fide interest in the purchase, sale, or lease of real estate and may not be used for any commercial purpose or any other purpose.</p>
			</footer>
		</div>
	);
};

export default SearchArea;
