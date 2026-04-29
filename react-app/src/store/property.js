import apiFetch from "../utils/apiFetch";
// Actions
const GET_PROPERTIES = "properties/SEARCH_PROPERTIES";
const GET_PROPERTY = "properties/GET_PROPERTY";

// Action Creators
export const getProperties = (properties) => ({
	type: GET_PROPERTIES,
	properties,
});

const getProperty = (property) => ({
	type: GET_PROPERTY,
	property,
});

// Thunks
export const searchProperties = (term) => async (dispatch) => {
	try {
		const response = await apiFetch(`/api/search/${term}`);
		if (response.ok) {
			const data = await response.json();
			const arr = Array.isArray(data.properties) ? data.properties : [];
			console.log("[searchProperties] received", arr.length, "listings");
			dispatch(getProperties(arr));
			return data;
		}
		const errData = await response.json().catch(() => ({}));
		return errData.errors ? errData : { errors: [`HTTP ${response.status}`] };
	} catch (err) {
		console.error("[searchProperties] fetch error:", err.message);
		return { errors: [err.message] };
	}
};

export const areaProperties = (payload) => async (dispatch) => {
	try {
		const response = await apiFetch("/api/listings?view=map", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ ...payload, limit: 1000 }),
		});
		if (response.ok) {
			const data = await response.json();
			const arr = Array.isArray(data.listings) ? data.listings : [];
			console.log("[areaProperties] received", arr.length, "listings");
			dispatch(getProperties(arr));
			return data;
		}
		const errData = await response.json().catch(() => ({}));
		console.error("[areaProperties] HTTP", response.status, errData);
		return errData.errors ? errData : { errors: [`HTTP ${response.status}`] };
	} catch (err) {
		console.error("[areaProperties] fetch error:", err.message);
		return { errors: [err.message] };
	}
};

export const getMlsListing = async (mlsNumber) => {
	try {
		const response = await apiFetch(`/api/listings/${encodeURIComponent(mlsNumber)}`);
		if (!response.ok) {
			return null;
		}
		const data = await response.json();
		return data.listing || null;
	} catch (err) {
		console.error("[getMlsListing] fetch error:", err.message);
		return null;
	}
};

export const getThisProperty = (property_id) => async (dispatch) => {
	try {
		const response = await apiFetch(`/api/properties/${property_id}`);
		if (response.ok) {
			const data = await response.json();
			dispatch(getProperty(data.property));
			return data;
		}
		const errData = await response.json().catch(() => ({}));
		return errData.errors ? errData : { errors: [`HTTP ${response.status}`] };
	} catch (err) {
		return { errors: [err.message] };
	}
};

// Reducer
// State shape:
// {
//   properties: [...],
//   [id]: property,
// }
const initialState = { properties: [] };

const buildState = (items) => {
	const next = { properties: items };
	items.forEach((p) => {
		if (p?.id != null) next[p.id] = p;
	});
	return next;
};

export default function reducer(state = initialState, action) {
	switch (action.type) {
		case GET_PROPERTIES: {
			const items = Array.isArray(action.properties) ? action.properties : [];
			console.log("[GET_PROPERTIES] reducer received", items.length, "items");
			return buildState(items);
		}
		case GET_PROPERTY: {
			if (!action.property?.id) return state;
			const items = Array.isArray(state.properties) ? [...state.properties] : [];
			const index = items.findIndex((item) => item?.id === action.property.id);
			if (index >= 0) {
				items[index] = action.property;
			} else {
				items.push(action.property);
			}
			return {
				...buildState(items),
			};
		}
		default:
			return state;
	}
}
