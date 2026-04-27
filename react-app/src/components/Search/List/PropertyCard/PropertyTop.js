import { useState, useEffect } from "react";
import { resolvePropertyImage, FALLBACK_IMAGE } from "../../../../utils/imageResolver";

const PropertyTop = ({ property }) => {
	const resolved = resolvePropertyImage(property);

	// Keep src in state so onError fallback survives React re-renders
	// (parent hover interactions would otherwise reset src back to the CDN URL)
	const [src, setSrc] = useState(resolved);
	useEffect(() => { setSrc(resolved); }, [resolved]);

	console.log(`[ImageResolver] ID: ${property?.id} | Final URL: ${src}`);

	const status = property?.status;
	const label = !status ? "Active"
		: /^a$/i.test(status) ? "Active"
		: /^u$/i.test(status) || /pending/i.test(status) ? "Pending"
		: /sold/i.test(status) ? "Sold"
		: status;

	return (
		<div className="card-top relative h-44 overflow-hidden bg-[#dadad5]">
			<img
				src={src}
				alt=""
				className="absolute inset-0 h-full w-full object-cover"
				onError={() => setSrc(FALLBACK_IMAGE)}
			/>
			<span className="absolute top-2 left-2 bg-black/55 text-white text-[9px] font-semibold uppercase tracking-wide px-1.5 py-[2px] rounded-full leading-tight">
				{label}
			</span>
		</div>
	);
};

export default PropertyTop;
