import { useState, useEffect, useRef, useMemo } from "react";
import {
	resolvePropertyImage,
	resolveUrl,
	FALLBACK_IMAGE,
} from "../../../utils/imageResolver";

const MAIN_H = 683;
const THUMB_W = 120;

const Images = ({ property }) => {
	const allImages = useMemo(() => {
		const hero = resolvePropertyImage(property);
		const thumbs = (property?.image_urls || []).map(resolveUrl).filter(Boolean);
		return [hero, ...thumbs].filter(Boolean);
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [property?.id]);

	const [currentIndex, setCurrentIndex] = useState(0);
	const [heroSrc, setHeroSrc] = useState(allImages[0] || FALLBACK_IMAGE);
	const thumbStripRef = useRef(null);
	const mainRef = useRef(null);
	const allImagesRef = useRef(allImages);

	useEffect(() => { allImagesRef.current = allImages; }, [allImages]);

	useEffect(() => {
		setCurrentIndex(0);
		setHeroSrc(allImages[0] || FALLBACK_IMAGE);
	}, [allImages]);

	const goTo = (idx) => {
		const imgs = allImagesRef.current;
		const next = (idx + imgs.length) % imgs.length;
		setCurrentIndex(next);
		setHeroSrc(imgs[next] || FALLBACK_IMAGE);
		if (thumbStripRef.current) {
			const el = thumbStripRef.current.children[next];
			if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
		}
	};

	// Non-passive wheel so we can preventDefault and cycle photos
	useEffect(() => {
		const el = mainRef.current;
		if (!el) return;
		const onWheel = (e) => {
			e.preventDefault();
			setCurrentIndex((prev) => {
				const imgs = allImagesRef.current;
				const next = (prev + (e.deltaY > 0 ? 1 : -1) + imgs.length) % imgs.length;
				setHeroSrc(imgs[next] || FALLBACK_IMAGE);
				if (thumbStripRef.current) {
					const thumbEl = thumbStripRef.current.children[next];
					if (thumbEl) thumbEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
				}
				return next;
			});
		};
		el.addEventListener("wheel", onWheel, { passive: false });
		return () => el.removeEventListener("wheel", onWheel);
	}, []);

	const total = allImages.length;

	return (
		<div className="flex w-full" style={{ gap: 6 }}>
			{/* Main photo — max 1024 × 683 */}
			<div
				ref={mainRef}
				className="relative overflow-hidden bg-[#dadad5] flex-1"
				style={{ height: MAIN_H, maxWidth: 1024 }}
			>
				<img
					className="w-full h-full object-cover"
					src={heroSrc}
					alt="Property"
					onError={() => setHeroSrc(FALLBACK_IMAGE)}
				/>

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

				{total > 1 && (
					<span className="absolute bottom-4 right-4 bg-black/60 text-white text-xs font-semibold px-3 py-1.5 rounded-full">
						{currentIndex + 1} / {total} photos
					</span>
				)}
			</div>

			{/* Thumbnail strip — right side, vertically scrollable */}
			{total > 1 && (
				<div
					ref={thumbStripRef}
					className="flex flex-col gap-1.5 overflow-y-auto flex-shrink-0 scrollbar-hide"
					style={{ width: THUMB_W, height: MAIN_H }}
				>
					{allImages.map((url, idx) => (
						<ThumbTile
							key={url + idx}
							url={url}
							active={currentIndex === idx}
							onClick={() => goTo(idx)}
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
			className={`w-full flex-shrink-0 object-cover rounded cursor-pointer transition-opacity ${
				active ? "opacity-100 ring-2 ring-[#2a6f97]" : "opacity-70 hover:opacity-100"
			}`}
			style={{ height: 80 }}
			src={src}
			alt=""
			onClick={onClick}
			onError={() => setFailed(true)}
		/>
	);
};

export default Images;
