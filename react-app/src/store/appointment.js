import apiFetch from "../utils/apiFetch";
// Actions
const GET_APPOINTMENTS = "appointments/GET_APPOINTMENTS";
const ADD_EDIT_APPOINTMENT = "appointments/ADD_EDIT_APPOINTMENT";
const DELETE_APPOINTMENT = "appointments/DELETE_APPOINTMENT";
const ARCHIVE_PAST = "appointments/ARCHIVE_PAST";

// Action Creators
const getAppointments = (appointments) => {
	return {
		type: GET_APPOINTMENTS,
		appointments,
	};
};

const addEditAppointment = (appointment) => {
	return {
		type: ADD_EDIT_APPOINTMENT,
		appointment,
	};
};

const deleteAppointment = (appointmentId) => {
	return {
		type: DELETE_APPOINTMENT,
		appointmentId,
	};
};

const parseErrorResponse = async (response) => {
	const text = await response.text();
	try {
		return JSON.parse(text);
	} catch {
		return { errors: [text || "Something went wrong. Please try again"] };
	}
};

// Thunks
export const getAllAppointments = () => async (dispatch) => {
	const response = await apiFetch("/api/appointments/");
	if (response.ok) {
		const data = await response.json();
		dispatch(getAppointments(data.appointments));
		return data;
	} else {
		return { errors: ["Something went wrong. Please try again"] };
	}
};

export const addAppointment = (appointment) => async (dispatch) => {
	try {
		const response = await apiFetch("/api/appointments/", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(appointment),
		});
		const data = response.ok
			? await response.json()
			: await parseErrorResponse(response);
		if (response.ok) {
			if (data.errors) {
				return data;
			}
			dispatch(addEditAppointment(data.appointment));
			return data.appointment;
		}
		return data;
	} catch {
		return { errors: ["Unable to request visit right now. Please try again."] };
	}
};

export const editAppointment = (appointment) => async (dispatch) => {
	try {
		const response = await apiFetch(`/api/appointments/${appointment.id}`, {
			method: "PUT",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(appointment),
		});
		const data = response.ok
			? await response.json()
			: await parseErrorResponse(response);
		if (response.ok) {
			if (data.errors) {
				return data;
			}
			dispatch(addEditAppointment(data.appointment));
			return data;
		}
		return data;
	} catch {
		return { errors: ["Something went wrong. Please try again"] };
	}
};

export const deleteThisAppointment = (appointmentId) => async (dispatch) => {
	try {
		const response = await apiFetch(`/api/appointments/${appointmentId}`, {
			method: "DELETE",
		});
		if (response.ok) {
			const data = await response.json();
			if (data.errors) {
				return data;
			}
			dispatch(deleteAppointment(appointmentId));
			return data;
		}
		return await parseErrorResponse(response);
	} catch {
		return { errors: ["Something went wrong. Please try again"] };
	}
};

export const archivePastAppointments = () => async (dispatch) => {
	try {
		const response = await apiFetch("/api/appointments/archive-past", {
			method: "POST",
		});
		if (response.ok) {
			const data = await response.json();
			dispatch({ type: ARCHIVE_PAST });
			return data;
		}
		return { errors: ["Failed to archive appointments"] };
	} catch {
		return { errors: ["Something went wrong. Please try again"] };
	}
};

export const assignAppointmentAgent = (appointmentId, agentId) => async (
	dispatch
) => {
	try {
		const response = await apiFetch(`/api/appointments/${appointmentId}/assign`, {
			method: "PUT",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ agent_id: agentId }),
		});
		const data = response.ok
			? await response.json()
			: await parseErrorResponse(response);
		if (response.ok) {
			if (data.errors) {
				return data;
			}
			dispatch(addEditAppointment(data.appointment));
			return data;
		}
		return data;
	} catch {
		return { errors: ["Something went wrong. Please try again"] };
	}
};

// Reducers
const initialState = { appointments: null };

export default function reducer(state = initialState, action) {
	let newState;
	switch (action.type) {
		case GET_APPOINTMENTS:
			newState = {};
			action.appointments.forEach((appt) => {
				newState[appt.id] = appt;
			});
			return newState;
		case ADD_EDIT_APPOINTMENT:
			newState = JSON.parse(JSON.stringify(state));
			newState[action.appointment.id] = action.appointment;
			return newState;
		case DELETE_APPOINTMENT:
			newState = JSON.parse(JSON.stringify(state));
			delete newState[action.appointmentId];
			return newState;
		case ARCHIVE_PAST: {
			const now = new Date();
			newState = { ...state };
			Object.keys(newState).forEach((id) => {
				const appt = newState[id];
				if (new Date(`${appt.date} ${appt.time}`) < now) {
					delete newState[id];
				}
			});
			return newState;
		}
		default:
			return state;
	}
}
