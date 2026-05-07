import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { X, Share2 } from "lucide-react";

import Images from "./Images";
import Detail from "./Detail";
import Tour from "./Tour";

import * as propertyImgActions from "../../store/property_img";
import * as agentActions from "../../store/agent";

// Injects listing JSON for the Tourit→FBMP Chrome extension.
// Runs on every listing open (modal AND standalone page).
function useFbmpEmbed(property) {
	useEffect(() => {
		if (!property) return;
		const street = [property.street_number, property.street_name, property.street_suffix]
			.filter(Boolean).join(" ");
		const unit = property.unit_number ? `#${property.unit_number} ` : "";
		const address = `${unit}${street}`;
		const payload = {
			mls_number: property.mls_number,
			title: `${property.bed ?? "?"}BR ${property.style || property.property_type || "Home"} for Rent | ${address}, ${property.city || ""}`,
			price: property.list_price,
			description: property.description || "",
			address,
			city: property.city || "",
			state: property.state || "",
			zip: property.zip || "",
			beds: property.bed,
			baths: property.bath,
			property_type: property.property_type || "",
			style: property.style || "",
			images: property.images || [],
		};
		let el = document.getElementById("tourit-listing-data");
		if (!el) {
			el = document.createElement("script");
			el.id = "tourit-listing-data";
			el.type = "application/json";
			document.head.appendChild(el);
		}
		el.textContent = JSON.stringify(payload);
		return () => { try { el.remove(); } catch {} };
	}, [property]);
}

const Property = ({ property, onClose, referralAgent = null, isPage = false }) => {
	const dispatch = useDispatch();
	const user = useSelector((state) => state.session.user);
	const [showMobileTour, setShowMobileTour] = useState(false);
	const [copied, setCopied] = useState(false);
	const copyTimer = useRef(null);

	useFbmpEmbed(property);

	const handleShare = () => {
		const mlsNum = property?.mls_number || property?.listing_id;
		const base = window.location.origin;
		const url = (user?.agent && !referralAgent)
			? `${base}/a/${user.id}/listing/${encodeURIComponent(mlsNum)}`
			: `${base}/listing/${encodeURIComponent(mlsNum)}`;
		navigator.clipboard.writeText(url).catch(() => {});
		setCopied(true);
		clearTimeout(copyTimer.current);
		copyTimer.current = setTimeout(() => setCopied(false), 2000);
	};

	useEffect(() => {
		if (!property?.is_mls && property?.id != null) {
			dispatch(propertyImgActions.getAllImages(property.id));
		}
		if (property.listing_agent_id != null) {
			dispatch(agentActions.getThisAgent(property.listing_agent_id));
		}
	}, [property, dispatch]);

	return (
		<div className="relative bg-white w-[96vw] max-w-[1350px] max-h-[92vh] rounded-2xl flex flex-col">

			{/* Close + Share buttons */}
			<div className="absolute top-3 right-3 z-30 flex items-center gap-1.5">
				<button
					type="button"
					className="flex items-center justify-center w-8 h-8 rounded-full bg-white/90 shadow text-gray-500 hover:text-gray-900 transition-colors"
					onClick={handleShare}
					title="Copy link"
				>
					{copied ? (
						<span className="text-[10px] font-semibold text-emerald-600 px-1">Copied!</span>
					) : (
						<Share2 size={14} strokeWidth={2} />
					)}
				</button>
				<button
					type="button"
					className="flex items-center justify-center w-8 h-8 rounded-full bg-white/90 shadow text-gray-500 hover:text-gray-900 transition-colors"
					onClick={(e) => { e.stopPropagation(); onClose(); }}
				>
					<X size={16} strokeWidth={2} />
				</button>
			</div>

			{/* Single scroll container — scrollbar on far right */}
			<div className={`overflow-y-auto flex-1 min-h-0 rounded-2xl${isPage ? " pb-20 md:pb-0" : ""}`}>
				<div className="flex items-start">

					{/* Left: gallery + detail */}
					<div className="flex-1 min-w-0">
						<Images property={property} />
						<div className="px-6 py-6">
							<Detail property={property} />
						</div>
					</div>

										{/* Right: Tour — sticky so it stays at top while left column scrolls */}
										<div className="max-sm:hidden flex-shrink-0 w-[350px] sticky top-0 self-start border-l border-gray-100 p-5">
											<Tour property={property} setShowTour={onClose} inline referralAgent={referralAgent} />
										</div>

				</div>
			</div>

			{/* Mobile: floating Tour button */}
			{!showMobileTour && (
				<div className={`md:hidden ${isPage ? "fixed" : "absolute"} bottom-0 left-0 right-0 px-4 pb-4 pt-10 bg-gradient-to-t from-white via-white/90 to-transparent pointer-events-none z-30`}>
					<button
						type="button"
						className="pointer-events-auto w-full rounded-xl bg-[#0f172a] py-3.5 text-sm font-semibold text-white shadow-lg active:opacity-80 transition-opacity"
						onClick={() => setShowMobileTour(true)}
					>
						{referralAgent ? `Tour with ${referralAgent.username}` : "Tour with a Buyer's Agent"}
					</button>
				</div>
			)}

			{/* Mobile: slide-up Tour panel */}
			{showMobileTour && (
				<div className={`md:hidden ${isPage ? "fixed" : "absolute"} inset-x-0 bottom-0 bg-white rounded-t-2xl shadow-2xl z-40 max-h-[88%] flex flex-col`}>
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
							referralAgent={referralAgent}
						/>
					</div>
				</div>
			)}
		</div>
	);
};

export default Property;
