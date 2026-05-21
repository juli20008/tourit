import apiFetch from '../utils/apiFetch';

// ── Actions ───────────────────────────────────────────────────────────────────

const SET_LIVE_TOURS = 'liveTours/SET';
const ADD_LIVE_TOUR  = 'liveTours/ADD';
const REMOVE_LIVE_TOUR = 'liveTours/REMOVE';

// ── Thunks ────────────────────────────────────────────────────────────────────

export const fetchLiveTours = (mlsNumber) => async (dispatch) => {
  const res = await apiFetch(`/api/live-tours?mls=${encodeURIComponent(mlsNumber)}`);
  if (res.ok) {
    const data = await res.json();
    dispatch({ type: SET_LIVE_TOURS, mlsNumber, tours: data.live_tours });
  }
};

export const createLiveTour = (payload) => async (dispatch) => {
  const res = await apiFetch('/api/live-tours', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (res.ok) {
    dispatch({ type: ADD_LIVE_TOUR, mlsNumber: payload.mls_number, tour: data.live_tour });
    return { tour: data.live_tour };
  }
  return { errors: data.errors };
};

export const deleteLiveTour = (tourId, mlsNumber) => async (dispatch) => {
  const res = await apiFetch(`/api/live-tours/${tourId}`, { method: 'DELETE' });
  if (res.ok) {
    dispatch({ type: REMOVE_LIVE_TOUR, tourId, mlsNumber });
  }
};

// ── Reducer ───────────────────────────────────────────────────────────────────
// Shape: { [mlsNumber]: [tour, ...] }

const initialState = {};

export default function liveTourReducer(state = initialState, action) {
  switch (action.type) {
    case SET_LIVE_TOURS:
      return { ...state, [action.mlsNumber]: action.tours };
    case ADD_LIVE_TOUR: {
      const existing = state[action.mlsNumber] || [];
      return { ...state, [action.mlsNumber]: [...existing, action.tour] };
    }
    case REMOVE_LIVE_TOUR: {
      const existing = state[action.mlsNumber] || [];
      return { ...state, [action.mlsNumber]: existing.filter(t => t.id !== action.tourId) };
    }
    default:
      return state;
  }
}
