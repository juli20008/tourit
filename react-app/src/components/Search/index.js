import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useParams } from "react-router-dom";

import List from "./List";
import MyMap from "./Map";

import * as propertyActions from "../../store/property";

const Search = () => {
	const dispatch = useDispatch();
	const searchParam = useParams().searchParam;
	const properties = useSelector((state) => state.properties?.properties ?? []);

	const [min, setMin] = useState(0);
	const [max, setMax] = useState(99999999999);
	const [type, setType] = useState("");
	const [bed, setBed] = useState(0);
	const [bath, setBath] = useState(0);
	const [transactionType, setTransactionType] = useState("For Sale");
	const [center] = useState({ lat: 43.7417, lng: -79.3733 });
	const [propArr, setPropArr] = useState([]);
	const [over, setOver] = useState({ id: 0 });
	const [isMapSyncing, setIsMapSyncing] = useState(false);

	// Use refs so bounds/transactionType changes don't cause re-render loops
	const boundsRef = useRef(null);
	const transactionTypeRef = useRef("For Sale");
	const fetchTimer = useRef(null);

	useEffect(() => {
		dispatch(propertyActions.searchProperties(searchParam));
	}, [dispatch, searchParam]);

	useEffect(() => {
		document.documentElement.classList.add("search-page-lock");
		document.body.classList.add("search-page-lock");
		return () => {
			document.documentElement.classList.remove("search-page-lock");
			document.body.classList.remove("search-page-lock");
		};
	}, []);

	// Client-side filter on already-fetched data
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

	const fetchFromMap = (bounds, tType) => {
		if (!bounds) return;
		if (fetchTimer.current) clearTimeout(fetchTimer.current);
		fetchTimer.current = setTimeout(async () => {
			setIsMapSyncing(true);
			await dispatch(propertyActions.areaProperties({
				...bounds,
				transaction_type: tType,
			}));
			setIsMapSyncing(false);
		}, 300);
	};

	// Called by Map when bounds change (pan/zoom/load)
	const handleMapBoundsChange = (bounds) => {
		if (!bounds) return;
		boundsRef.current = bounds;
		fetchFromMap(bounds, transactionTypeRef.current);
	};

	// Called by dropdown — updates both state (for client filter + UI) and ref (for API)
	const handleTransactionTypeChange = (newType) => {
		setTransactionType(newType);
		transactionTypeRef.current = newType;
		fetchFromMap(boundsRef.current, newType);
	};

	const apiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
	const googleMapURL = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&v=3.exp&libraries=geometry,drawing,places&loading=async`;

	return (
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
				onBoundsChange={handleMapBoundsChange}
				enableAreaSearch={false}
				syncCenter={false}
				transactionType={transactionType}
				setTransactionType={handleTransactionTypeChange}
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
				compactMode={false}
				showMapAreaButton={false}
				isMapSyncing={isMapSyncing}
			/>
		</main>
	);
};
export default Search;
