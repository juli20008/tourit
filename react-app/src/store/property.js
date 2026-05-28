import apiFetch from "../utils/apiFetch";
// Actions
const GET_PROPERTIES = "properties/SEARCH_PROPERTIES";
const GET_PROPERTY = "properties/GET_PROPERTY";

const _r = (x) => Math.round(x * 100) / 100;
const LS_TTL = 4 * 60 * 60 * 1000; // 4 hours

function _lsGet(key) {
	try {
		const raw = localStorage.getItem(key);
		if (!raw) return null;
		const { ts, data } = JSON.parse(raw);
		if (Date.now() - ts > LS_TTL) return null;
		return data;
	} catch { return null; }
}

// Like _lsGet but returns stale data even after TTL expires (for stale-while-revalidate).
function _lsGetStale(key) {
	try {
		const raw = localStorage.getItem(key);
		if (!raw) return null;
		const { data } = JSON.parse(raw);
		return data ?? null;
	} catch { return null; }
}

function _lsSet(key, data) {
	try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); } catch {}
}

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
		const latMin = payload?.lat_min ?? payload?.swLat ?? payload?.south ?? payload?.minLat;
		const latMax = payload?.lat_max ?? payload?.neLat ?? payload?.north ?? payload?.maxLat;
		const lngMin = payload?.lng_min ?? payload?.swLng ?? payload?.west ?? payload?.minLng;
		const lngMax = payload?.lng_max ?? payload?.neLng ?? payload?.east ?? payload?.maxLng;

		// Stale-while-revalidate: show last-known dots instantly while fresh data loads
		const cacheKey = `map_${_r(latMin)}_${_r(latMax)}_${_r(lngMin)}_${_r(lngMax)}`;
		const cached = _lsGet(cacheKey);
		if (cached) dispatch(getProperties(cached));

		const body = {
			...payload,
			lat_min: latMin,
			lat_max: latMax,
			lng_min: lngMin,
			lng_max: lngMax,
		};
		const response = await apiFetch("/api/listings?view=map", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
		if (response.ok) {
			const data = await response.json();
			const arr = Array.isArray(data.listings) ? data.listings : [];
			console.log("[areaProperties] received", arr.length, "listings");
			dispatch(getProperties(arr));
			_lsSet(cacheKey, arr);
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

export const fetchPinIndex = () => async () => {
	const stale = _lsGetStale("pin_index");
	const fresh = _lsGet("pin_index"); // null if expired or absent

	const fetchFresh = async () => {
		try {
			const response = await apiFetch("/api/listings/pin-index");
			if (!response.ok) return null;
			const data = await response.json();
			const pins = Array.isArray(data.pins) ? data.pins : [];
			if (pins.length > 0) _lsSet("pin_index", pins);
			return pins;
		} catch {
			return null;
		}
	};

	// Stale-while-revalidate: return cached data instantly (even if expired),
	// fire a background refresh so the next load gets fresh data.
	if (stale && stale.length > 0) {
		if (!fresh) fetchFresh(); // cache expired — refresh quietly in background
		return stale;
	}

	// No cache at all (first ever visit) — must wait for the API.
	return (await fetchFresh()) ?? [];
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
