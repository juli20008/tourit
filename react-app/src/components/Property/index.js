import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { X, Share2, QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

import Images from "./Images";
import Detail from "./Detail";
import Tour from "./Tour";
import ShareModal from "./ShareModal";

import * as propertyImgActions from "../../store/property_img";
import * as agentActions from "../../store/agent";
import { getWhitelabelSlug } from "../../utils/whitelabel";

// Injects listing JSON for the Tourit→FBMP Chrome extension.
// Runs on every listing open (modal AND standalone page).
function useFbmpEmbed(property) {
	useEffect(() => {
		if (!property) return;
		const street = property.street || "";
		const unit = (property.unit || property.unit_number) ? `#${property.unit || property.unit_number} ` : "";
		const address = `${unit}${street}`.trim();
		const payload = {
			mls_number: property.mls_number,
			title: `${property.bed ?? "?"}BR ${property.style || property.property_type || "Home"} for Rent | ${address}, ${property.city || ""}`,
			price: property.price,
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
	const [showShare, setShowShare] = useState(false);
	const [showQR, setShowQR] = useState(false);

	useFbmpEmbed(property);

	const buildListingUrl = () => {
		const mlsNum = property?.mls_number || property?.listing_id;
		const base = window.location.origin;
		const wlSlug = getWhitelabelSlug();
		if (wlSlug) {
			return `${base}/listing/${encodeURIComponent(mlsNum)}`;
		} else if (user?.agent && !referralAgent) {
			const slug = (user.username || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
			const isProd = window.location.hostname.endsWith('tourit.ca');
			return (slug && isProd)
				? `https://${slug}.tourit.ca/listing/${encodeURIComponent(mlsNum)}`
				: `${base}/a/${user.id}/listing/${encodeURIComponent(mlsNum)}`;
		}
		return `${base}/listing/${encodeURIComponent(mlsNum)}`;
	};

	const buildShareUrl = () => {
		const mlsNum = property?.mls_number || property?.listing_id;
		const origin = window.location.origin;
		const agentId = referralAgent?.id || (user?.agent && !referralAgent ? user.id : null);
		const wlSlug = getWhitelabelSlug();
		const base = `${origin}/share/listing/${encodeURIComponent(mlsNum)}`;
		const params = new URLSearchParams();
		if (agentId) params.set("agent", String(agentId));
		// If on a whitelabel and no agent id, still hint Flask so canonical stays on this domain
		if (wlSlug && !agentId) params.set("wl", wlSlug);
		const qs = params.toString();
		return qs ? `${base}?${qs}` : base;
	};

	const handleQR = () => setShowQR(true);

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

			{/* Close + Share + QR buttons */}
			<div className="absolute top-3 right-3 z-30 flex items-center gap-1.5">
				<button
					type="button"
					className="flex items-center justify-center w-8 h-8 rounded-full bg-white/90 shadow text-gray-500 hover:text-gray-900 transition-colors"
					onClick={() => setShowShare(true)}
					title="Share listing"
				>
					<Share2 size={14} strokeWidth={2} />
				</button>
				<button
					type="button"
					className="flex items-center justify-center w-8 h-8 rounded-full bg-white/90 shadow text-gray-500 hover:text-gray-900 transition-colors"
					onClick={handleQR}
					title="Generate QR code"
				>
					<QrCode size={14} strokeWidth={2} />
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

			{/* Share modal — card preview + save image + copy link */}
			{showShare && (
				<ShareModal
					property={property}
					shareUrl={buildShareUrl()}
					onClose={() => setShowShare(false)}
				/>
			)}

			{/* QR code modal */}
			{showQR && (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
					onClick={() => setShowQR(false)}
				>
					<div
						className="bg-white rounded-2xl shadow-2xl p-6 flex flex-col items-center gap-4 max-w-xs w-full mx-4"
						onClick={(e) => e.stopPropagation()}
					>
						<div className="flex items-center justify-between w-full">
							<span className="text-sm font-semibold text-[#0f172a]">Scan to view property</span>
							<button
								type="button"
								onClick={() => setShowQR(false)}
								className="flex items-center justify-center w-7 h-7 rounded-full bg-[#f1f5f9] text-gray-500 hover:bg-[#e2e8f0]"
							>
								<X size={13} strokeWidth={2} />
							</button>
						</div>
						<QRCodeSVG
							value={buildListingUrl()}
							size={220}
							bgColor="#ffffff"
							fgColor="#0f172a"
							level="M"
							includeMargin
						/>
						<p className="text-[11px] text-[#94a3b8] text-center break-all">{buildListingUrl()}</p>
					</div>
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
