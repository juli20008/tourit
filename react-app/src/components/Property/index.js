import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { X } from "lucide-react";

import Images from "./Images";
import Detail from "./Detail";
import Tour from "./Tour";

import * as propertyImgActions from "../../store/property_img";
import * as agentActions from "../../store/agent";

const Property = ({ property, onClose }) => {
	const dispatch = useDispatch();
	const [showMobileTour, setShowMobileTour] = useState(false);

	useEffect(() => {
		if (!property?.is_mls && property?.id != null) {
			dispatch(propertyImgActions.getAllImages(property.id));
		}
		if (property.listing_agent_id != null) {
			dispatch(agentActions.getThisAgent(property.listing_agent_id));
		}
	}, [property, dispatch]);

	return (
		<div className="relative bg-white w-[96vw] max-w-[1300px] max-h-[92vh] rounded-2xl flex flex-col">

			{/* Close button — outside the scroll area so it stays visible */}
			<button
				type="button"
				className="absolute top-3 right-3 z-30 flex items-center justify-center w-8 h-8 rounded-full bg-white/90 shadow text-gray-500 hover:text-gray-900 transition-colors"
				onClick={(e) => { e.stopPropagation(); onClose(); }}
			>
				<X size={16} strokeWidth={2} />
			</button>

			{/* Content: two columns */}
			<div className="flex flex-1 min-h-0 rounded-2xl overflow-hidden">

				{/* Left: gallery + detail, independently scrollable */}
				<div className="flex-1 min-w-0 overflow-y-auto">
					<Images property={property} />
					<div className="px-6 py-6">
						<Detail property={property} />
					</div>
				</div>

				{/* Right: Tour — always visible, scrolls if content overflows */}
				<div className="flex-shrink-0 w-[300px] overflow-y-auto border-l border-gray-100 p-5">
					<Tour property={property} setShowTour={onClose} inline />
				</div>

			</div>

			{/* Mobile: floating Tour button */}
			{!showMobileTour && (
				<div className="md:hidden absolute bottom-0 left-0 right-0 px-4 pb-4 pt-10 bg-gradient-to-t from-white via-white/90 to-transparent pointer-events-none rounded-b-2xl">
					<button
						type="button"
						className="pointer-events-auto w-full rounded-xl bg-[#0f172a] py-3.5 text-sm font-semibold text-white shadow-lg active:opacity-80 transition-opacity"
						onClick={() => setShowMobileTour(true)}
					>
						Tour with a Buyer&apos;s Agent
					</button>
				</div>
			)}

			{/* Mobile: slide-up Tour panel */}
			{showMobileTour && (
				<div className="md:hidden absolute inset-x-0 bottom-0 bg-white rounded-t-2xl shadow-2xl z-20 max-h-[88%] flex flex-col">
					<div className="flex items-center justify-center relative pt-3 pb-1 flex-shrink-0">
						<div className="w-10 h-1 rounded-full bg-[#e2e8f0]" />
						<button
							type="button"
							className="absolute right-3 top-2 flex items-center justify-center w-8 h-8 rounded-full bg-[#f1f1ee] text-gray-500"
							onClick={() => setShowMobileTour(false)}
						>
							<X size={14} />
						</button>
					</div>
					<div className="overflow-y-auto flex-1 min-h-0">
						<Tour
							property={property}
							setShowTour={() => setShowMobileTour(false)}
							inline
						/>
					</div>
				</div>
			)}
		</div>
	);
};

export default Property;
