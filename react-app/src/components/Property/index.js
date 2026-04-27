import { useEffect } from "react";
import { useDispatch } from "react-redux";
import { X } from "lucide-react";

import Images from "./Images";
import Detail from "./Detail";
import Tour from "./Tour";

import * as propertyImgActions from "../../store/property_img";
import * as agentActions from "../../store/agent";

const Property = ({ property, onClose }) => {
	const dispatch = useDispatch();

	useEffect(() => {
		dispatch(propertyImgActions.getAllImages(property.id));
		if (property.listing_agent_id != null) {
			dispatch(agentActions.getThisAgent(property.listing_agent_id));
		}
	}, [property, dispatch]);

	return (
		<div className="relative bg-white w-[92vw] max-w-[1200px] max-h-[92vh] overflow-y-auto rounded-2xl">

			{/* Close button */}
			<button
				type="button"
				className="absolute top-3 right-3 z-20 flex items-center justify-center w-8 h-8 rounded-full bg-white/90 shadow text-gray-500 hover:text-gray-900 transition-colors"
				onClick={onClose}
			>
				<X size={16} strokeWidth={2} />
			</button>

			{/* ── Gallery (full width top) ── */}
			<Images property={property} />

			{/* ── Body: responsive layout ── */}
			<div className="flex flex-col md:flex-row md:gap-8 md:px-8 md:py-7 md:items-start">

				{/* Tour — sticky full-width on mobile, right sidebar on desktop */}
				<div className="order-first md:order-last w-full md:w-[300px] md:flex-shrink-0
				                sticky top-0 z-10 bg-white
				                px-4 pt-4 pb-3 md:p-0 md:top-6
				                border-b border-[#e8e8e2] md:border-none shadow-sm md:shadow-none">
					<Tour property={property} setShowTour={onClose} inline />
				</div>

				{/* Detail — scrolls below Tour on mobile, left column on desktop */}
				<div className="flex-1 min-w-0 px-4 py-5 md:p-0">
					<Detail property={property} />
				</div>
			</div>
		</div>
	);
};

export default Property;
