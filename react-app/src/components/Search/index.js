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
	const [sqftMin, setSqftMin] = useState(0);
	const [sqftMax, setSqftMax] = useState(999999);
	const [strataMin, setStrataMin] = useState(0);
	const [strataMax, setStrataMax] = useState(999999);
	const [titleStatus, setTitleStatus] = useState("");
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

	// Client-side filter on already-fetched data
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
				compactMode={false}
				showMapAreaButton={false}
				isMapSyncing={isMapSyncing}
			/>
		</main>
	);
};
export default Search;
