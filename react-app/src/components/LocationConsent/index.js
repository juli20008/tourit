import { MapPin, X } from "lucide-react";

const LocationConsent = ({ onAccept, onDecline }) => (
	<div
		className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[9998] w-[calc(100%-32px)] max-w-lg"
		role="dialog"
		aria-modal="true"
		aria-label="Location and cookie consent"
	>
		<div className="bg-[#0f172a] text-white rounded-2xl px-5 py-4 shadow-2xl flex flex-col gap-3">
			<div className="flex items-start gap-3">
				<MapPin size={18} className="flex-shrink-0 mt-0.5 text-white/60" strokeWidth={1.5} />
				<p className="text-sm leading-relaxed text-white/90">
					We use cookies and your location to show nearby listings.
					Your location is used solely to find properties near you and will not be shared with third parties.
				</p>
				<button
					type="button"
					onClick={onDecline}
					className="flex-shrink-0 text-white/40 hover:text-white/80 transition-colors"
					aria-label="Dismiss"
				>
					<X size={16} strokeWidth={2} />
				</button>
			</div>
			<div className="flex items-center gap-3 pl-7">
				<button
					type="button"
					onClick={onAccept}
					className="bg-white text-[#0f172a] px-5 py-1.5 rounded-lg text-sm font-semibold hover:bg-white/90 transition-colors"
				>
					Accept
				</button>
				<a
					href="/about"
					className="text-sm text-white/50 hover:text-white/80 transition-colors"
				>
					Learn More
				</a>
			</div>
		</div>
	</div>
);

export default LocationConsent;
