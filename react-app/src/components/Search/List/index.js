import apiFetch from "../../../utils/apiFetch";
import { useEffect, useRef, useState } from "react";
import { useHistory, useParams } from "react-router-dom";

import PropertyCard from "./PropertyCard";
import FilterPanel from "./FilterPanel";

import noproperty from "../../../assets/no-property-nobg.svg";

const List = ({
	min,
	setMin,
	max,
	setMax,
	type,
	setType,
	bed,
	setBed,
	bath,
	setBath,
	sqftMin: sqftMinProp = null,
	setSqftMin: setSqftMinProp = null,
	sqftMax: sqftMaxProp = null,
	setSqftMax: setSqftMaxProp = null,
	strataMin: strataMinProp = null,
	setStrataMin: setStrataMinProp = null,
	strataMax: strataMaxProp = null,
	setStrataMax: setStrataMaxProp = null,
	titleStatus: titleStatusProp = null,
	setTitleStatus: setTitleStatusProp = null,
	transactionType: transactionTypeProp = null,
	propArr,
	setOver,
	url,
	showMapAreaButton = true,
	compactMode = false,
	isMapSyncing = false,
	hideSearch = false,
	showFilters: showFiltersProp = null,
	setShowFilters: setShowFiltersProp = null,
}) => {
	const history = useHistory();
	const searchParam = useParams().searchParam;
	const areaParam = useParams().areaParam;

	const [search, setSearch] = useState("");
	const [searchList, setSearchList] = useState([]);
	const [searchFiltered, setSearchFiltered] = useState([]);
	const [error, setError] = useState("");
	const [showFiltersInternal, setShowFiltersInternal] = useState(false);
	const showFilters = showFiltersProp !== null ? showFiltersProp : showFiltersInternal;
	const setShowFilters = setShowFiltersProp !== null ? setShowFiltersProp : setShowFiltersInternal;

	const [sqftMinInternal, setSqftMinInternal] = useState(0);
	const [sqftMaxInternal, setSqftMaxInternal] = useState(999999);
	const [strataMinInternal, setStrataMinInternal] = useState(0);
	const [strataMaxInternal, setStrataMaxInternal] = useState(999999);
	const [titleStatusInternal, setTitleStatusInternal] = useState("");
	const [transactionTypeInternal] = useState("For Sale");

	const sqftMin = sqftMinProp !== null ? sqftMinProp : sqftMinInternal;
	const setSqftMin = setSqftMinProp !== null ? setSqftMinProp : setSqftMinInternal;
	const sqftMax = sqftMaxProp !== null ? sqftMaxProp : sqftMaxInternal;
	const setSqftMax = setSqftMaxProp !== null ? setSqftMaxProp : setSqftMaxInternal;
	const strataMin = strataMinProp !== null ? strataMinProp : strataMinInternal;
	const setStrataMin = setStrataMinProp !== null ? setStrataMinProp : setStrataMinInternal;
	const strataMax = strataMaxProp !== null ? strataMaxProp : strataMaxInternal;
	const setStrataMax = setStrataMaxProp !== null ? setStrataMaxProp : setStrataMaxInternal;
	const titleStatus = titleStatusProp !== null ? titleStatusProp : titleStatusInternal;
	const setTitleStatus = setTitleStatusProp !== null ? setTitleStatusProp : setTitleStatusInternal;
	const transactionType = transactionTypeProp !== null ? transactionTypeProp : transactionTypeInternal;

	const [visibleCount, setVisibleCount] = useState(10);
	const listRef = useRef(null);
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
			setError("Please enter address, city, or postal code to search");
		}
	};

	const searchByArea = (e) => {
		e.preventDefault();

		history.push(url);
	};

	useEffect(() => {
		apiFetch("/api/search/terms")
			.then((res) => res.json())
			.then((res) => setSearchList(res.terms))
			.catch((err) => console.log(err));
		if (searchParam) {
			const param = searchParam.split("-").join(" ");
			setSearch(param);
		}
	}, [searchParam]);

	useEffect(() => {
		const filtered = searchList.filter((term) =>
			term.toLowerCase().includes(search.toLowerCase())
		);
		setSearchFiltered(filtered);
	}, [search, searchList]);

	useEffect(() => {
		setVisibleCount(10);
		if (listRef.current) listRef.current.scrollTop = 0;
	}, [propArr]);

	const RESULT_CAP = 100;
	const cappedArr = propArr.slice(0, RESULT_CAP);
	const totalResults = cappedArr.length;
	const visibleProperties = cappedArr.slice(0, visibleCount);

	const handleListScroll = (e) => {
		const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
		if (scrollHeight - scrollTop - clientHeight < 300) {
			setVisibleCount(c => Math.min(c + 10, cappedArr.length));
		}
	};

	return (
		<div className="search-wrap bg-[#f3f3f1] text-[#1f1f1f]">
			{!compactMode && !hideSearch && (
				<div className="search-bar-wrap sticky top-0 z-20 border-b border-[#e5e5e0] bg-[#f3f3f1] px-3 py-1">
					<form className="search-bar flex items-center gap-2" onSubmit={handleSubmit}>
						<label className="search-label-sm relative min-w-[220px] flex-1">
							<input
								type="text"
								className="search-input w-full rounded-md border border-[#d6d6d0] bg-white px-11 py-1 text-sm text-[#303030] transition focus:border-[#2a6f97]"
								placeholder="City, Neighbourhood, ..."
								value={search}
								onChange={(e) => setSearch(e.target.value)}
								ref={searchDivRef}
							/>
							<i
								className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-[#8c8c85]"
								onClick={handleSubmit}
							></i>
							{error && <div className="search-error pt-2 text-xs text-rose-500">{error}</div>}
							<div
								className="search-dd search-dd-sm absolute mt-1 max-h-56 w-full overflow-auto rounded-md border border-[#dbdbd6] bg-white shadow-lg"
								ref={searchDDRef}
							>
								{searchFiltered.map((term) => (
									<div
										className="div flex cursor-pointer items-center gap-2 border-b border-[#f1f1ed] px-3 py-2 text-sm text-[#333] transition hover:bg-[#f7f7f3]"
										key={term}
										onMouseDown={(e) => {
											setSearch(term);
											directSearch(term);
										}}
									>
										<i className="fa-solid fa-magnifying-glass"></i>
										<div className="term truncate">{term}</div>
									</div>
								))}
							</div>
						</label>
						<button
							className="self-stretch flex items-center rounded-md border border-[#d6d6d0] bg-white px-4 text-xs font-semibold uppercase tracking-wide text-[#2d2d2d] transition hover:bg-[#f7f7f3]"
							type="button"
							onClick={() => setShowFilters(true)}
						>
							<i className="fa-solid fa-sliders mr-2"></i>Filter
						</button>
						{!areaParam && showMapAreaButton && url && (
							<button
								className="btn rounded-md border border-[#d6d6d0] bg-white px-3 py-1 text-xs text-[#40403b] transition hover:bg-[#f7f7f3]"
								type="button"
								onClick={searchByArea}
							>
								Search by Map Area
							</button>
						)}
					</form>
					<div className="search-bar mt-1 flex items-center justify-between border-t border-[#e5e5e0] pt-1">
						<div className="results text-sm text-[#5c5c56]">
							{isMapSyncing ? "Updating..." : propArr.length >= RESULT_CAP ? "Top 100 Results" : `${totalResults} Results`}
						</div>
						<div className="flex items-center gap-2">
							<button className="rounded-full border border-[#d9d9d3] bg-[#f6f6f3] px-3 py-1 text-xs text-[#555]">
								<i className="fa-regular fa-map mr-1"></i>Map
							</button>
							<button className="rounded-full border border-[#d9d9d3] bg-white px-3 py-1 text-xs text-[#555]">
								<i className="fa-solid fa-list mr-1"></i>List
							</button>
						</div>
					</div>
				</div>
			)}
			{propArr.length ? (
				<div
					ref={listRef}
					className="search-list grid flex-1 grid-cols-1 gap-3 overflow-y-auto px-4 py-3 lg:grid-cols-2"
					onScroll={handleListScroll}
				>
					{visibleProperties.map((property, index) => (
						<PropertyCard
							key={`${property.id}-${index}`}
							property={property}
							setOver={setOver}
						/>
					))}
					{visibleCount < totalResults && (
						<div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "12px 0", color: "#94a3b8", fontSize: 13 }}>
							Loading more…
						</div>
					)}
				</div>
			) : (
				<div className="search-no-results flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
					<img className="img" src={noproperty} alt="No property" />
					<div className="title text-2xl font-semibold text-[#2d2d2b]">Sorry no results are found</div>
					<div className="desc text-sm text-[#6d6d66]">
						Please search different city or filter with different criteria
					</div>
				</div>
			)}
			{showFilters && (
				<FilterPanel
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
					onClose={() => setShowFilters(false)}
				/>
			)}
		</div>
	);
};

export default List;
