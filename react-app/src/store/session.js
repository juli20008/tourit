import apiFetch from "../utils/apiFetch";
// constants
const SET_USER = "session/SET_USER";
const REMOVE_USER = "session/REMOVE_USER";
const UPDATE_USER = "session/UPDATE_USER";
const UPLOAD_PHOTO = "session/UPLOAD_PHOTO";
const AUTH_CHECKED = "session/AUTH_CHECKED";

const authCheckedAction = () => ({ type: AUTH_CHECKED });

// Action Creator
const setUser = (user) => ({
	type: SET_USER,
	payload: user,
});

export const updateUser = (user) => ({
	type: UPDATE_USER,
	payload: user,
});

export const uploadPhoto = (url) => ({
	type: UPLOAD_PHOTO,
	url,
});

const removeUser = () => ({
	type: REMOVE_USER,
});

// Thunks
export const authenticate = () => async (dispatch) => {
	try {
		const response = await apiFetch("/api/auth/", {
			headers: { "Content-Type": "application/json" },
		});
		if (response.ok) {
			const data = await response.json();
			if (!data.errors) dispatch(setUser(data));
		}
	} finally {
		dispatch(authCheckedAction());
	}
};

export const login = (email, password) => async (dispatch) => {
	const response = await apiFetch("/api/auth/login", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			email,
			password,
		}),
	});

	if (response.ok) {
		const data = await response.json();
		dispatch(setUser(data));
		return null;
	} else if (response.status < 500) {
		const data = await response.json();
		if (data.errors) {
			return data.errors;
		}
	} else {
		return ["An error occurred. Please try again."];
	}
};

export const logout = () => async (dispatch) => {
	const response = await apiFetch("/api/auth/logout", {
		headers: {
			"Content-Type": "application/json",
		},
	});

	if (response.ok) {
		dispatch(removeUser());
	}
};

export const signUp =
	(username, email, password, agent) => async (dispatch) => {
		const response = await apiFetch("/api/auth/signup", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				username,
				email,
				password,
				agent,
			}),
		});

		if (response.ok) {
			const data = await response.json();
			dispatch(setUser(data));
			return null;
		} else if (response.status < 500) {
			const data = await response.json();
			if (data.errors) {
				return data.errors;
			}
		} else {
			return ["An error occurred. Please try again."];
		}
	};

export const updateThisUser = (user) => async (dispatch) => {
	const response = await apiFetch("/api/auth/", {
		method: "PUT",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify(user),
	});

	if (response.ok) {
		const data = await response.json();
		dispatch(updateUser(data.user));
		return data;
	} else if (response.status < 500) {
		const data = await response.json();
		if (data.errors) {
			return data;
		}
	} else {
		return { errors: ["An error occurred. Please try again."] };
	}
};

export const addServiceArea = (zip) => async (dispatch, getState) => {
	const response = await apiFetch("/api/service_areas/", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(zip),
	});
	const data = await response.json();
	if (response.ok) {
		const currentAreas = getState().session.user?.areas || [];
		dispatch(updateUser({ areas: [...currentAreas, data.area] }));
		return data;
	}
	return data?.errors ? data : { errors: ["An error occurred. Please try again."] };
};

export const uploadVoiceSample = (audioBlob) => async (dispatch, getState) => {
	const formData = new FormData();
	formData.append("audio", audioBlob, "voice_sample.webm");
	const response = await apiFetch("/api/xhs/agent/voice", {
		method: "POST",
		body: formData,
	});
	const data = await response.json();
	if (response.ok) {
		dispatch(updateUser({ has_voice: true, voice_sample_url: data.voice_sample_url }));
		return data;
	}
	return { error: data.error || "Upload failed" };
};

export const deleteVoiceSample = () => async (dispatch) => {
	const response = await apiFetch("/api/xhs/agent/voice", { method: "DELETE" });
	if (response.ok) {
		dispatch(updateUser({ has_voice: false, voice_sample_url: null }));
	}
};

export const removeServiceArea = (zip) => async (dispatch, getState) => {
	const response = await apiFetch(`/api/service_areas/${zip}`, {
		method: "DELETE",
	});
	const data = await response.json();
	if (response.ok) {
		const currentAreas = getState().session.user?.areas || [];
		dispatch(updateUser({ areas: currentAreas.filter((a) => a.zip !== zip) }));
		return data;
	}
	return data?.errors ? data : { errors: ["An error occurred. Please try again."] };
};

// Reducer
const initialState = { user: null, authChecked: false };

export default function reducer(state = initialState, action) {
	let newState;
	switch (action.type) {
		case AUTH_CHECKED:
			return { ...state, authChecked: true };
		case SET_USER:
			return { ...state, user: action.payload };
		case UPDATE_USER:
			newState = JSON.parse(JSON.stringify(state));
			newState.user = { ...newState.user, ...action.payload };
			return newState;
		case UPLOAD_PHOTO:
			newState = JSON.parse(JSON.stringify(state));
			newState.user = { ...newState.user, photo: action.url.url };
			return newState;
		case REMOVE_USER:
			return { user: null };
		default:
			return state;
	}
}
