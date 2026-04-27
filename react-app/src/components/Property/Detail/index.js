import { useSelector } from "react-redux";

const statusColor = (s) => {
	if (!s) return "bg-emerald-500";
	const l = s.toLowerCase();
	if (l === "active" || l === "a") return "bg-emerald-500";
	if (l === "pending" || l === "u") return "bg-amber-400";
	if (l === "sold") return "bg-gray-400";
	return "bg-emerald-500";
};

const statusLabel = (s) => {
	if (!s) return "For Sale";
	const l = s.toLowerCase();
	if (l === "active" || l === "a") return "For Sale";
	if (l === "pending" || l === "u") return "Pending";
	if (l === "sold") return "Sold";
	return s;
};

const Feature = ({ icon, label }) => (
	<div className="flex items-center gap-3 py-3 border-b border-stroke last:border-0">
		<span className="w-5 text-center text-[#2a6f97]">
			<i className={icon}></i>
		</span>
		<span className="text-sm text-gray-700">{label}</span>
	</div>
);

const Detail = ({ property }) => {
	const agents = useSelector((state) => state.agents);

	const fmtPrice = (p) =>
		"$" + (p ?? 0).toFixed(0).replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1,");

	const pricePerSqft =
		property?.sqft > 0
			? (property.price / property.sqft).toFixed(0)
			: null;

	return (
		<div className="font-sans text-[#1a1a18]">

			{/* Status badge */}
			<div className="flex items-center gap-2 mb-3">
				<span className={`inline-block w-2.5 h-2.5 rounded-full ${statusColor(property?.status)}`} />
				<span className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
					{statusLabel(property?.status)}
				</span>
			</div>

			{/* Price */}
			<div className="text-4xl font-bold text-ink leading-none mb-2">
				{fmtPrice(property?.price)}
			</div>

			{/* Beds / Baths / Sqft */}
			<div className="flex items-center gap-1 text-base text-gray-700 mb-3">
				<span><strong>{property?.bed}</strong> bd</span>
				<span className="mx-2 text-stroke">|</span>
				<span><strong>{property?.bath}</strong> ba</span>
				<span className="mx-2 text-stroke">|</span>
				<span><strong>{property?.sqft?.toLocaleString()}</strong> sqft</span>
			</div>

			{/* Address */}
			<div className="text-lg text-inkMuted mb-1">
				{property?.street}, {property?.city}, {property?.state} {property?.zip}
			</div>

			{/* Listed date */}
			<div className="text-xs text-gray-400 mb-6">
				Listed {property?.listing_date}
			</div>

			<hr className="border-stroke mb-6" />

			{/* Property features */}
			<h3 className="text-base font-semibold text-ink mb-1">Property Details</h3>
			<div className="divide-y divide-stroke">
				<Feature icon="fa-regular fa-building" label={property?.type || "—"} />
				<Feature icon="fa-regular fa-calendar-days" label={property?.built ? `Built in ${property.built}` : "Year built: —"} />
				<Feature icon="fa-solid fa-square-parking" label={property?.garage ? `${property.garage} Car Garage` : "No Garage"} />
				<Feature icon="fa-solid fa-snowflake" label="Central Air" />
				{pricePerSqft && (
					<Feature icon="fa-solid fa-ruler-combined" label={`$${pricePerSqft} / sqft`} />
				)}
			</div>

			<hr className="border-stroke my-6" />

			{/* Description */}
			<h3 className="text-base font-semibold text-ink mb-3">Overview</h3>
			<p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">
				{property?.description || "No description available."}
			</p>

			<hr className="border-stroke my-6" />

			{/* Listing agent */}
			{agents[property?.listing_agent_id] && (
				<>
					<h3 className="text-base font-semibold text-ink mb-2">Listing Agent</h3>
					<div className="text-sm text-gray-600 space-y-0.5 mb-6">
						<div className="font-medium">
							{agents[property?.listing_agent_id]?.username}
						</div>
						<div>
							DRE# {agents[property?.listing_agent_id]?.license_num} &nbsp;·&nbsp;{" "}
							{agents[property?.listing_agent_id]?.phone}
						</div>
						{property?.office && <div>{property.office}</div>}
					</div>
					<hr className="border-stroke mb-6" />
				</>
			)}

			{/* MLS disclaimer */}
			<p className="text-[10px] text-gray-400 leading-relaxed mb-8">
				The multiple listing data appearing on this website is owned and copyrighted
				by the applicable MLS. All listing data, including square footage and lot
				size, is believed to be accurate but is not warranted or guaranteed. The
				viewer should independently verify listed data before making any decisions.
			</p>
		</div>
	);
};

export default Detail;
