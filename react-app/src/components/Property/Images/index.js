import { useState, useEffect } from "react";
import {
	resolvePropertyImage,
	resolveUrl,
} from "../../../utils/imageResolver";

const Images = ({ property }) => {
	const heroResolved = resolvePropertyImage(property);

	const thumbUrls = (property?.image_urls || [])
		.map(resolveUrl)
		.filter(Boolean);

	// All images: hero first, then the CDN thumbnails
	const allImages = [heroResolved, ...thumbUrls].filter(Boolean);

	const [currentIndex, setCurrentIndex] = useState(0);
	const [heroSrc, setHeroSrc] = useState(allImages[0] || null);

	// Reset when property changes
	useEffect(() => {
		const imgs = [resolvePropertyImage(property), ...thumbUrls].filter(Boolean);
		setCurrentIndex(0);
		setHeroSrc(imgs[0] || null);
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [property?.id]);

	const goTo = (idx) => {
		const next = (idx + allImages.length) % allImages.length;
		setCurrentIndex(next);
		setHeroSrc(allImages[next] || null);
	};

	const total = allImages.length;

	return (
		<div className="w-full">
			{/* Hero — 16:9 aspect ratio, full width */}
			<div className="relative w-full overflow-hidden bg-[#dadad5]" style={{ maxWidth: 1024, aspectRatio: '1024/683' }}>
				{heroSrc ? (
				<img
					className="w-full h-full object-cover"
					src={heroSrc}
					alt="Property"
					fetchpriority="high"
					onError={() => setHeroSrc(null)}
				/>
				) : (
				<div className="w-full h-full flex items-center justify-center">
					<span className="text-[#9aabb8] text-sm">Photos coming soon</span>
				</div>
				)}

				{/* Left arrow */}
				{total > 1 && (
					<button
						type="button"
						aria-label="Previous photo"
						className="absolute left-3 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-9 h-9 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
						onClick={() => goTo(currentIndex - 1)}
					>
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
							<polyline points="15 18 9 12 15 6" />
						</svg>
					</button>
				)}

				{/* Right arrow */}
				{total > 1 && (
					<button
						type="button"
						aria-label="Next photo"
						className="absolute right-3 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-9 h-9 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
						onClick={() => goTo(currentIndex + 1)}
					>
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
							<polyline points="9 18 15 12 9 6" />
						</svg>
					</button>
				)}

				{/* Photo counter */}
				{total > 1 && (
					<span className="absolute bottom-4 right-4 bg-black/60 text-white text-xs font-semibold px-3 py-1.5 rounded-full">
						{currentIndex + 1} / {total} photos
					</span>
				)}
			</div>

			{/* Thumbnail strip — click updates main photo, no lightbox */}
			{thumbUrls.length > 0 && (
				<div className="flex gap-2 px-1 pt-2 overflow-x-auto scrollbar-hide">
					{thumbUrls.map((url, idx) => (
						<ThumbTile
							key={url + idx}
							url={url}
							active={currentIndex === idx + 1}
							onClick={() => goTo(idx + 1)}
						/>
					))}
				</div>
			)}
		</div>
	);
};

const ThumbTile = ({ url, active, onClick }) => {
	const [src, setSrc] = useState(url);
	const [failed, setFailed] = useState(false);
	useEffect(() => { setSrc(url); setFailed(false); }, [url]);
	if (failed) return null;
	return (
		<img
			className={`flex-shrink-0 w-24 h-16 object-cover rounded cursor-pointer transition-opacity ${
				active ? "opacity-100 ring-2 ring-[#2a6f97]" : "opacity-70 hover:opacity-100"
			}`}
			src={src}
			alt=""
			loading="lazy"
			onClick={onClick}
			onError={() => setFailed(true)}
		/>
	);
};

export default Images;
