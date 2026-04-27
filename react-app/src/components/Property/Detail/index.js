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

const fmtPrice = (p) =>
	"$" + (p ?? 0).toFixed(0).replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1,");

const daysOnMarket = (listingDate) => {
	if (!listingDate) return null;
	const diff = Math.floor((Date.now() - new Date(listingDate)) / 86400000);
	return diff >= 0 ? diff : null;
};

const Row = ({ label, value }) => (
	<div className="flex py-2.5 border-b border-[#f0f0ec] last:border-0">
		<span className="w-44 flex-shrink-0 text-sm text-gray-500">{label}</span>
		<span className="text-sm font-medium text-[#1a1a18]">{value ?? "—"}</span>
	</div>
);

const Section = ({ title, children }) => (
	<div className="mb-6">
		<h3 className="text-sm font-semibold uppercase tracking-widest text-gray-400 mb-2">{title}</h3>
		<div>{children}</div>
	</div>
);

const Detail = ({ property }) => {
	const agents = useSelector((state) => state.agents);

	const pricePerSqft =
		property?.sqft > 0
			? "$" + (property.price / property.sqft).toFixed(0)
			: null;

	const dom = daysOnMarket(property?.listing_date);

	return (
		<div className="font-sans text-[#1a1a18]">

			{/* Status */}
			<div className="flex items-center gap-2 mb-3">
				<span className={`inline-block w-2.5 h-2.5 rounded-full ${statusColor(property?.status)}`} />
				<span className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
					{statusLabel(property?.status)}
					{property?.transaction_type && (
						<span className="ml-2 text-gray-400 normal-case font-normal">
							· For {property.transaction_type}
						</span>
					)}
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
				{property?.sqft && (
					<>
						<span className="mx-2 text-stroke">|</span>
						<span><strong>{property.sqft.toLocaleString()}</strong> sqft</span>
					</>
				)}
			</div>

			{/* Address */}
			<div className="text-lg text-inkMuted mb-1">
				{[property?.unit && `Unit ${property.unit}`, property?.street, property?.city, property?.state, property?.zip]
					.filter(Boolean).join(", ")}
			</div>
			{property?.neighborhood && (
				<div className="text-sm text-gray-400 mb-1">{property.neighborhood}</div>
			)}
			<div className="text-xs text-gray-400 mb-6">
				Listed {property?.listing_date}
				{dom !== null && <span className="ml-2">· {dom} days on market</span>}
			</div>

			<hr className="border-stroke mb-6" />

			{/* About */}
			{property?.description && (
				<>
					<Section title="About this home">
						<p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">
							{property.description}
						</p>
					</Section>
					<hr className="border-stroke mb-6" />
				</>
			)}

			{/* Home facts and features */}
			<h2 className="text-base font-semibold text-ink mb-4">Home facts and features</h2>

			<Section title="Price details">
				<Row label="List Price" value={fmtPrice(property?.price)} />
				{property?.original_price && property.original_price !== property.price && (
					<Row label="Original Price" value={fmtPrice(property.original_price)} />
				)}
				{property?.sold_price && (
					<Row label="Sold Price" value={fmtPrice(property.sold_price)} />
				)}
				{pricePerSqft && <Row label="Price per sqft" value={pricePerSqft} />}
				<Row label="Est. Mortgage" value="—" />
			</Section>

			<Section title="Home details">
				<Row label="Style" value={property?.style || property?.type || "—"} />
				<Row label="Property Type" value={property?.property_type || property?.property_class || "—"} />
				<Row label="Bedrooms" value={property?.bed || "—"} />
				<Row label="Bathrooms" value={property?.bath || "—"} />
				<Row label="Full Bathrooms" value="—" />
				<Row label="Half Bathrooms" value="—" />
				<Row label="Sqft" value={property?.sqft ? property.sqft.toLocaleString() : "—"} />
				<Row label="Year Built" value={property?.built || "—"} />
				<Row label="Storeys" value="—" />
				<Row label="Basement" value="—" />
				<Row label="Garage" value={property?.garage ? `${property.garage} Car Garage` : "—"} />
				<Row label="Lot Size" value="—" />
				<Row label="Lot Frontage" value="—" />
				<Row label="Annual Tax" value="—" />
			</Section>

			<Section title="Location">
				<Row label="Neighbourhood" value={property?.neighborhood || "—"} />
				<Row label="City" value={property?.city || "—"} />
				<Row label="Province / State" value={property?.state || "—"} />
				<Row label="Postal Code" value={property?.zip || "—"} />
			</Section>

			<Section title="Brokerage details">
				<Row label="Brokerage" value={property?.brokerage || property?.office || "—"} />
			</Section>

			<Section title="Listing details">
				<Row label="MLS #" value={property?.mls_number || property?.listing_id || "—"} />
				<Row label="Listed" value={property?.listing_date || "—"} />
				<Row label="Days on Market" value={dom !== null ? `${dom} days` : "—"} />
				<Row label="Status" value={statusLabel(property?.status)} />
				<Row label="Source" value="TRREB" />
			</Section>

			<hr className="border-stroke mb-4" />

			{/* Disclaimer */}
			<p className="text-[10px] text-gray-400 leading-relaxed mb-8">
				The information provided herein is deemed reliable but is not guaranteed accurate by PROPTX.
				The information provided herein must only be used by consumers that have a bona fide interest
				in the purchase, sale, or lease of real estate and may not be used for any commercial purpose
				or any other purpose.
			</p>
		</div>
	);
};

export default Detail;
