export const REPLIERS_CDN = "https://cdn.repliers.io";
export const FALLBACK_IMAGE =
	"https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=500&q=80";

/**
 * Resolves one raw URL string.
 *
 * Rules (in priority order):
 *  1. null / empty / non-string  →  null  (skip)
 *  2. contains "amazonaws.com"   →  null  (dead S3 seed data)
 *  3. already absolute ("http")  →  pass through unchanged
 *  4. relative path (e.g. "sample/IMG-xxx.jpg")  →  prefix Repliers CDN
 *
 * The "sample/" prefix is Repliers' own CDN path format.
 * Every relative string is assumed to belong to Repliers.
 */
export const resolveUrl = (url) => {
	if (!url || typeof url !== "string") return null;
	const trimmed = url.trim();
	if (!trimmed) return null;
	if (trimmed.includes("amazonaws.com")) return null;
	if (trimmed.startsWith("http")) return trimmed;
	// Relative path → Repliers CDN (strip any accidental leading slashes)
	const clean = trimmed.replace(/^\/+/, "");
	if (!clean) return null;
	return `${REPLIERS_CDN}/${clean}`;
};

/**
 * Returns the best available image URL for a property.
 *
 * Tries sources in this order:
 *  1. property.front_img
 *  2. each entry in property.image_urls
 *
 * Falls back to FALLBACK_IMAGE only when every source is null / S3.
 */
export const resolvePropertyImage = (property) => {
	const sources = [
		property?.front_img,
		...(Array.isArray(property?.image_urls) ? property.image_urls : []),
	];
	for (const src of sources) {
		const url = resolveUrl(src);
		if (url) return url;
	}
	return FALLBACK_IMAGE;
};
