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
		<h3 className="text-sm font-semibold uppercase tracking-widest text-gray-800 mb-2">{title}</h3>
		<div>{children}</div>
	</div>
);

const Detail = ({ property }) => {
	const agents = useSelector((state) => state.agents);


	const dom = daysOnMarket(property?.listing_date);

	const propText = [property?.style, property?.property_type, property?.property_class, property?.type]
		.filter(Boolean).join(' ').toLowerCase();
	const cat = property?.category || '';
	const isCondo    = cat ? cat === 'Condo'     : /condo|apt|apartment|flat|strata/i.test(propText);
	const isTownhouse = cat ? cat === 'Townhouse' : /townhouse|town.?house|row/i.test(propText);
	const isHouse    = !isCondo && !isTownhouse;
	const isForSale  = (property?.transaction_type || '').toLowerCase() !== 'for lease';
	const showStrataFee = isCondo && isForSale && property?.association_fee > 0;

	const fmtFee = (fee, freq) => {
		const s = "$" + Number(fee).toFixed(0).replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1,");
		return freq ? `${s} / ${freq}` : s;
	};

	// DDF OwnershipType numeric codes → human label
	const ownershipLabel = (code) => {
		if (!code) return null;
		const map = {
			'3':  'Freehold',
			'1':  'Condo',
			'13': 'Freehold + POTL',
			'16': 'Common Elements Condo',
			'4':  'Leasehold',
			'6':  'Co-op',
		};
		return map[String(code)] || null;
	};

	return (
		<div className="font-sans text-[#1a1a18]">

			{/* Status */}
			<div className="flex items-center gap-2 mb-3">
				<span className={`inline-block w-2.5 h-2.5 rounded-full ${statusColor(property?.status)}`} />
				<span className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
					{property?.transaction_type
						? property.transaction_type
						: statusLabel(property?.status)}
					{(property?.status?.toLowerCase() === "u" || property?.status?.toLowerCase() === "pending") && (
						<span className="ml-2 text-amber-500 normal-case font-normal">· Pending</span>
					)}
					{property?.status?.toLowerCase() === "sold" && (
						<span className="ml-2 text-gray-400 normal-case font-normal">· Sold</span>
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
						<p className="text-base text-gray-600 leading-relaxed whitespace-pre-line">
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
	
				{showStrataFee && (
					<Row label="Strata / Maint. Fee" value={fmtFee(property.association_fee, property.association_fee_frequency)} />
				)}
			</Section>

			<Section title="Home details">
				{/* ── Common ── */}
				{property?.bed          && <Row label="Bedrooms"        value={property.bed} />}
				{property?.beds_above_grade > 0 && <Row label="Bedrooms above grade" value={property.beds_above_grade} />}
				{property?.basement_beds > 0    && <Row label="Basement bedrooms"    value={property.basement_beds} />}
				{property?.bath         && <Row label="Full Bathrooms"  value={property.bath} />}
				{(isCondo || isTownhouse) && property?.bath_half > 0 && (
					<Row label="Partial Bathrooms" value={property.bath_half} />
				)}
				{property?.parking_total && <Row label="Parking Spaces" value={property.parking_total} />}
				{property?.category && (
					<Row label="Property Type" value={property.category} />
				)}
				{property?.sqft         && <Row label="Sqft"       value={Number(property.sqft).toLocaleString()} />}
				{property?.levels       && <Row label="Storeys"     value={property.levels} />}

				{/* ── House-specific ── */}
				{isHouse && <>
					{ownershipLabel(property?.ownership_type) && <Row label="Title Status"    value={ownershipLabel(property.ownership_type)} />}
					{property?.lot_size_area > 0  && <Row label="Lot Size"        value={`${Number(property.lot_size_area).toLocaleString()} ft²`} />}
					{property?.lot_frontage        && <Row label="Lot Frontage"    value={property.lot_frontage} />}
					{property?.construction_materials && <Row label="Exterior Finish" value={property.construction_materials} />}
					{property?.heating             && <Row label="Heating Type"    value={property.heating} />}
					{property?.cooling             && <Row label="Cooling"         value={property.cooling} />}
				</>}

				{/* ── Condo-specific ── */}
				{isCondo && <>
					{ownershipLabel(property?.ownership_type) && <Row label="Title Status" value={ownershipLabel(property.ownership_type)} />}
					{property?.construction_materials          && <Row label="Exterior Finish" value={property.construction_materials} />}
					{property?.heating                         && <Row label="Heating Type"    value={property.heating} />}
					{property?.cooling                         && <Row label="Cooling"         value={property.cooling} />}
				</>}

				{/* ── Townhouse-specific ── */}
				{isTownhouse && !isCondo && <>
					{ownershipLabel(property?.ownership_type) && <Row label="Title Status" value={ownershipLabel(property.ownership_type)} />}
					{property?.construction_materials          && <Row label="Exterior Finish" value={property.construction_materials} />}
					{property?.heating                         && <Row label="Heating Type"    value={property.heating} />}
					{property?.cooling                         && <Row label="Cooling"         value={property.cooling} />}
				</>}
			</Section>

			<Section title="Location">
				{property?.neighborhood && <Row label="Neighbourhood" value={property.neighborhood} />}
				<Row label="City" value={property?.city || "—"} />
				<Row label="Province / State" value={property?.state || "—"} />
				<Row label="Postal Code" value={property?.zip || "—"} />
			</Section>

			<Section title="Brokerage details">
				<Row label="Brokerage" value={property?.brokerage || property?.office || "—"} />
			</Section>

			<Section title="Listing details">
				{(property?.mls_number || property?.listing_id) && (
					<Row label="MLS #" value={property.mls_number || property.listing_id} />
				)}
				{dom !== null && <Row label="Days on Market" value={`${dom} days`} />}
				{(property?.standard_status || property?.status) && (
					<Row label="Status" value={property.standard_status || property.status} />
				)}
				<Row label="Source" value={property?.is_mls ? "CREA" : "—"} />
			</Section>

			<hr className="border-stroke mb-4" />

			{/* Disclaimer */}
			<p className="text-[10px] text-gray-400 leading-relaxed pb-12">
				The information provided herein is deemed reliable but is not guaranteed accurate by PROPTX.
				The information provided herein must only be used by consumers that have a bona fide interest
				in the purchase, sale, or lease of real estate and may not be used for any commercial purpose
				or any other purpose.
			</p>
		</div>
	);
};

export default Detail;
