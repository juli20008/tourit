import apiFetch from "./apiFetch";

export const needsMlsHydration = (property) => {
	if (!property) return false;
	return !property.description || !Array.isArray(property.image_urls) || property.image_urls.length === 0;
};

export const hydrateMlsListing = async (property) => {
	if (!needsMlsHydration(property)) {
		return property;
	}

	const mlsNumber = property?.mls_number || property?.listing_id || null;
	if (!mlsNumber) {
		return property;
	}

	try {
		const response = await apiFetch(`/api/listings/${encodeURIComponent(mlsNumber)}`);
		if (!response.ok) {
			return property;
		}
		const data = await response.json();
		return data.listing || property;
	} catch (error) {
		return property;
	}
};
