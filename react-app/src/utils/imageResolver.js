export const FALLBACK_IMAGE = null;

export const resolveUrl = (url) => {
	if (!url || typeof url !== "string") return null;
	const trimmed = url.trim();
	if (!trimmed) return null;
	if (trimmed.includes("amazonaws.com")) return null;
	if (trimmed.includes("unsplash.com")) return null;
	if (trimmed.startsWith("http")) return trimmed;
	return null;
};

export const resolvePropertyImage = (property) => {
	const sources = [
		property?.front_img,
		...(Array.isArray(property?.image_urls) ? property.image_urls : []),
	];
	for (const src of sources) {
		const url = resolveUrl(src);
		if (url) return url;
	}
	return null;
};
