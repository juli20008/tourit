import { useState } from "react";
import { resolveUrl, FALLBACK_IMAGE } from "../../../utils/imageResolver";

const statusLabel = (s) => {
	if (!s) return "Active";
	const l = s.toLowerCase();
	if (l === "a") return "Active";
	if (l === "u") return "Sold";
	return s;
};

const PreviewItem = ({ property, onSelect }) => {
	const rawSrc =
		resolveUrl(property.image_urls?.[0] || property.front_img) ||
		FALLBACK_IMAGE;
	const [imgSrc, setImgSrc] = useState(rawSrc);

	const price = new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		maximumFractionDigits: 0,
	}).format(property.price);

	return (
		<div
			className="flex items-center gap-2.5 px-2 py-1.5 cursor-pointer transition-colors duration-150 hover:bg-surface"
			onClick={() => onSelect && onSelect(property)}
		>
			{/* Thumbnail */}
			<div className="relative flex-shrink-0 w-[128px] h-[104px] rounded overflow-hidden">
				<img
					className="w-full h-full object-cover"
					src={imgSrc}
					alt=""
					onError={() => setImgSrc(FALLBACK_IMAGE)}
				/>
				<span className="absolute bottom-1 left-1.5 bg-black/55 text-white text-[9px] font-semibold uppercase tracking-wide px-1.5 py-[2px] rounded-full leading-tight">
					{statusLabel(property.status)}
				</span>
			</div>

			{/* Text block */}
			<div className="flex-1 min-w-0 flex flex-col justify-center gap-[3px]">
				<div className="text-[16px] font-bold text-ink leading-tight">
					{price}
				</div>
				<div className="text-[13px] text-inkMuted truncate">
					{property.street}, {property.city}
				</div>
				<div className="text-[13px] text-[#5f6b7a]">
					{property.bed}&nbsp;bd&nbsp;&middot;&nbsp;{property.bath}&nbsp;ba
					{property.sqft
						? ` · ${property.sqft.toLocaleString()} sqft`
						: ""}
				</div>
				{(property.brokerage || property.office || property.listing_brokerage) && (
					<>
						<hr className="border-gray-200 my-0.5" />
						<div className="text-[11px] text-[#5f6b7a] truncate">
							{property.brokerage || property.office || property.listing_brokerage}
						</div>
					</>
				)}
			</div>
		</div>
	);
};

const PropertyPreviewList = ({ properties, onSelect }) => (
	<div className="w-[350px] h-[200px] font-sans overflow-hidden">
		<div className="max-h-full overflow-y-auto divide-y divide-stroke">
			{properties.map((p) => (
				<PreviewItem key={p.id} property={p} onSelect={onSelect} />
			))}
		</div>
	</div>
);

export default PropertyPreviewList;
