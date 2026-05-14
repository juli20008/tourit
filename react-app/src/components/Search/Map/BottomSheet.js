import { useEffect, useState } from "react";
import { resolveUrl } from "../../../utils/imageResolver";

const statusLabel = (s) => {
	if (!s) return "Active";
	const l = s.toLowerCase();
	if (l === "a") return "Active";
	if (l === "u") return "Sold";
	return s;
};

const SheetCard = ({ property, onSelect }) => {
	const rawSrc =
		resolveUrl(property.image_urls?.[0] || property.front_img) || null;
	const [imgSrc, setImgSrc] = useState(rawSrc);

	const price = new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		maximumFractionDigits: 0,
	}).format(property.price);

	return (
		<div
			className="flex-shrink-0 w-[180px] cursor-pointer rounded-lg overflow-hidden bg-white shadow-md border border-[#f1f5f9]"
			onClick={() => onSelect && onSelect(property)}
		>
			<div className="relative h-[105px] bg-[#dadad5] flex items-center justify-center">
				{imgSrc ? (
				<img
					className="absolute inset-0 w-full h-full object-cover"
					src={imgSrc}
					alt=""
					onError={() => setImgSrc(null)}
				/>
				) : (
				<span className="text-[#9aabb8] text-[10px]">Photos coming soon</span>
				)}
				<span className="absolute bottom-1.5 left-1.5 bg-black/55 text-white text-[9px] font-semibold uppercase tracking-wide px-1.5 py-[2px] rounded-full">
					{statusLabel(property.status)}
				</span>
			</div>
			<div className="px-2 py-1.5 flex flex-col gap-0.5">
				<div className="text-[15px] font-bold text-[#0f172a]">{price}</div>
				<div className="text-[11px] text-[#536071] truncate">
					{property.street}, {property.city}
				</div>
				<div className="text-[11px] text-[#5f6b7a]">
					{property.bed} bd · {property.bath} ba
					{property.sqft ? ` · ${Number(property.sqft).toLocaleString()} sqft` : ""}
				</div>
				{(property.brokerage || property.office || property.listing_brokerage) && (
					<div className="text-[10px] text-[#5f6b7a] truncate">
						{property.brokerage || property.office || property.listing_brokerage}
					</div>
				)}
			</div>
		</div>
	);
};

const BottomSheet = ({ properties, onSelect, onClose }) => {
	// Close on background tap
	useEffect(() => {
		const handler = (e) => {
			if (e.target.classList.contains("bottom-sheet-backdrop")) onClose();
		};
		document.addEventListener("click", handler);
		return () => document.removeEventListener("click", handler);
	}, [onClose]);

	return (
		<div className="bottom-sheet-backdrop fixed inset-0 z-40 flex items-end pointer-events-none">
			<div
				className="bottom-sheet-panel pointer-events-auto w-full bg-white rounded-t-2xl shadow-2xl pb-safe"
				style={{ maxHeight: "55vh" }}
			>
				{/* Handle */}
				<div className="flex justify-center pt-1.5 pb-1">
					<div className="w-10 h-1 rounded-full bg-[#e2e8f0]" />
				</div>

				{/* Horizontal scroll of cards */}
				<div className="flex gap-2 overflow-x-auto px-2 pb-2 scrollbar-hide">
					{properties.map((p) => (
						<SheetCard key={p.id} property={p} onSelect={onSelect} />
					))}
				</div>
			</div>
		</div>
	);
};

export default BottomSheet;
