import { useState, useEffect } from "react";
import { resolvePropertyImage } from "../../../../utils/imageResolver";

const PropertyTop = ({ property }) => {
	const resolved = resolvePropertyImage(property);
	const [src, setSrc] = useState(resolved);
	useEffect(() => { setSrc(resolved); }, [resolved]);

	const status = property?.status;
	const label = !status ? "Active"
		: /^a$/i.test(status) ? "Active"
		: /^u$/i.test(status) || /pending/i.test(status) ? "Pending"
		: /sold/i.test(status) ? "Sold"
		: status;

	return (
		<div className="card-top relative h-44 overflow-hidden bg-[#dadad5]">
			{src ? (
				<img
					src={src}
					alt=""
					className="absolute inset-0 h-full w-full object-cover"
					onError={() => setSrc(null)}
				/>
			) : (
				<div className="absolute inset-0 flex items-center justify-center">
					<span className="text-[#9aabb8] text-xs">Photos coming soon</span>
				</div>
			)}
			<span className="absolute top-2 left-2 bg-black/55 text-white text-[9px] font-semibold uppercase tracking-wide px-1.5 py-[2px] rounded-full leading-tight">
				{label}
			</span>
		</div>
	);
};

export default PropertyTop;
