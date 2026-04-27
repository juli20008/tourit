import apiFetch from "../../utils/apiFetch";
import { useState, useEffect, useMemo, useRef } from "react";
import { useHistory } from "react-router-dom";
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

const Splash = () => {
	const history = useHistory();
	const defaultGtaArea =
		"/area/neLat=44.20&neLng=-78.90&swLat=43.30&swLng=-80.80&zoom=10";
	const gtaAreaPayload = {
		neLat: 44.20,
		neLng: -78.90,
		swLat: 43.30,
		swLng: -80.80,
	};
	const gtaCenter = { lat: 43.7417, lng: -79.3733 }; // Toronto GTA

	const [search, setSearch] = useState("");
	const [searchList, setSearchList] = useState([]);
	const [searchFiltered, setSearchFiltered] = useState([]);
	const [error, setError] = useState();
	const [placeholder, setPlaceholder] = useState(
		"Enter an address, city, or Postal Code"
	);
	const [newlyListed, setNewlyListed] = useState([]);
	const [mapCenter, setMapCenter] = useState(gtaCenter);
	const [over, setOver] = useState({ id: 0 });

	const searchDivRef = useRef();
	const searchDDRef = useRef();

	const directSearch = (term) => {
		setError("");
		const searchTerm = term.split(" ").join("-");
		history.push(`/search/${searchTerm}`);
	};

	const handleSubmit = async (e) => {
		e.preventDefault();
		if (search.length > 0) {
			setError("");
			const searchTerm = search.split(" ").join("-");
			history.push(`/search/${searchTerm}`);
		} else {
			setError("");
			history.push(defaultGtaArea);
		}
	};

	useEffect(() => {
		apiFetch("/api/search/terms")
			.then((res) => res.json())
			.then((res) => setSearchList(res.terms))
			.catch((err) => console.log(err));
	}, []);

	useEffect(() => {
		apiFetch("/api/search/areas", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(gtaAreaPayload),
		})
			.then((res) => res.json())
			.then((res) => setNewlyListed(res.properties || []))
			.catch((err) => console.log(err));
	}, []);

	useEffect(() => {
		const filtered = searchList.filter((term) =>
			term.toLowerCase().includes(search.toLowerCase())
		);
		setSearchFiltered(filtered);
	}, [search, searchList]);

	useEffect(() => {
		if (newlyListed.length) {
			const latArr = newlyListed.map((prop) => prop.lat);
			const lngArr = newlyListed.map((prop) => prop.lng);
			const centerLat = latArr.reduce((acc, el) => acc + el) / latArr.length;
			const centerLng = lngArr.reduce((acc, el) => acc + el) / lngArr.length;
			setMapCenter({ lat: centerLat, lng: centerLng });
		} else {
			setMapCenter(gtaCenter);
		}
	}, [newlyListed]);

	const googleMapURL = useMemo(() => {
		const apiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
		return `https://maps.googleapis.com/maps/api/js?key=${apiKey}&v=3.exp&libraries=geometry,drawing,places`;
	}, []);

	return (
		<>
			<main className="splash-ctrl">
				<section className="splash-search-wrap">
					<div className="splash-hero-head">
						<p className="splash-kicker">Modern home intelligence</p>
						<h1 className="splash-search-title">
							Find your next property with calm, data-backed clarity.
						</h1>
						<p className="splash-subtitle">
							Search live inventory, scan map movement in real time, and book
							showings without friction.
						</p>
					</div>
					<form className="splash-search-panel" onSubmit={handleSubmit}>
						<label className="search-label">
							<Search size={18} strokeWidth={1.5} className="search-icon" />
							<input
								type="text"
								className="search-input"
								placeholder={placeholder}
								value={search}
								onChange={(e) => setSearch(e.target.value)}
								onFocus={() =>
									setPlaceholder('Don\'t know where to start? Try "Toronto"')
								}
								onBlur={() =>
									setPlaceholder("Enter an address, city, or Postal Code")
								}
								ref={searchDivRef}
							/>
							{error && <div className="splash-error">{error}</div>}
							<div className="search-dd" ref={searchDDRef}>
								{searchFiltered.map((term) => (
									<div
										className="div"
										key={term}
										onMouseDown={() => {
											setSearch(term);
											directSearch(term);
										}}
									>
										<Search size={15} strokeWidth={1.5} />
										<div className="term">{term}</div>
									</div>
								))}
							</div>
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
							propArr={newlyListed}
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
