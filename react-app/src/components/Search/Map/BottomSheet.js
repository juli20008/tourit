import { useEffect } from "react";
import { resolveUrl, FALLBACK_IMAGE } from "../../../utils/imageResolver";
import { useState } from "react";

const statusLabel = (s) => {
	if (!s) return "Active";
	const l = s.toLowerCase();
	if (l === "a") return "Active";
	if (l === "u") return "Sold";
	return s;
};

const SheetCard = ({ property, onSelect }) => {
	const rawSrc = resolveUrl(property.image_urls?.[0] || property.front_img) || FALLBACK_IMAGE;
	const [imgSrc, setImgSrc] = useState(rawSrc);

	const price = new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		maximumFractionDigits: 0,
	}).format(property.price);

	return (
		<div
			className="flex-shrink-0 w-[220px] cursor-pointer rounded-xl overflow-hidden bg-white shadow-md border border-[#f1f5f9]"
			onClick={() => onSelect && onSelect(property)}
		>
			<div className="relative h-[130px] bg-[#dadad5]">
				<img
					className="w-full h-full object-cover"
					src={imgSrc}
					alt=""
					onError={() => setImgSrc(FALLBACK_IMAGE)}
				/>
				<span className="absolute bottom-2 left-2 bg-black/55 text-white text-[9px] font-semibold uppercase tracking-wide px-2 py-[2px] rounded-full">
					{statusLabel(property.status)}
				</span>
			</div>
			<div className="p-3 flex flex-col gap-1">
				<div className="text-[15px] font-bold text-[#0f172a]">{price}</div>
				<div className="text-[11px] text-[#64748b] truncate">
					{property.street}, {property.city}
				</div>
				<div className="text-[11px] text-[#94a3b8]">
					{property.bed} bd · {property.bath} ba
					{property.sqft ? ` · ${Number(property.sqft).toLocaleString()} sqft` : ""}
				</div>
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
				className="pointer-events-auto w-full bg-white rounded-t-2xl shadow-2xl pb-safe"
				style={{ maxHeight: "55vh" }}
			>
				{/* Handle */}
				<div className="flex justify-center pt-3 pb-2">
					<div className="w-10 h-1 rounded-full bg-[#e2e8f0]" />
				</div>

				{/* Count label */}
				<div className="px-4 pb-2 text-[12px] font-semibold text-[#64748b] uppercase tracking-wide">
					{properties.length === 1 ? "1 listing" : `${properties.length} listings`}
				</div>

				{/* Horizontal scroll of cards */}
				<div className="flex gap-3 overflow-x-auto px-4 pb-5 scrollbar-hide">
					{properties.map((p) => (
						<SheetCard key={p.id} property={p} onSelect={onSelect} />
					))}
				</div>
			</div>
		</div>
	);
};

export default BottomSheet;
