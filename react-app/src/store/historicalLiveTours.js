import apiFetch from '../utils/apiFetch';

const SET_HISTORICAL_TOURS   = 'historicalLiveTours/SET';
const ADD_HISTORICAL_TOUR    = 'historicalLiveTours/ADD';
const REMOVE_HISTORICAL_TOUR = 'historicalLiveTours/REMOVE';

export const fetchHistoricalTours = (mlsNumber) => async (dispatch) => {
  const res = await apiFetch(`/api/historical-live-tours?mls=${encodeURIComponent(mlsNumber)}`);
  if (res.ok) {
    const data = await res.json();
    dispatch({ type: SET_HISTORICAL_TOURS, mlsNumber, tours: data.historical_tours });
  }
};

export const uploadHistoricalTour = (mlsNumber, file, title) => async (dispatch) => {
  try {
    const formData = new FormData();
    formData.append('mls_number', mlsNumber);
    formData.append('video', file);
    if (title) formData.append('title', title);

    const res = await apiFetch('/api/historical-live-tours', {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    if (res.ok) {
      dispatch({ type: ADD_HISTORICAL_TOUR, mlsNumber, tour: data.historical_tour });
      return { tour: data.historical_tour };
    }
    return { errors: data.errors || ['Server error'] };
  } catch (e) {
    console.error('[uploadHistoricalTour]', e);
    return { errors: ['Network error — check console'] };
  }
};

export const deleteHistoricalTour = (tourId, mlsNumber) => async (dispatch) => {
  const res = await apiFetch(`/api/historical-live-tours/${tourId}`, { method: 'DELETE' });
  if (res.ok) {
    dispatch({ type: REMOVE_HISTORICAL_TOUR, tourId, mlsNumber });
  }
};

const initialState = {};

export default function historicalLiveTourReducer(state = initialState, action) {
  switch (action.type) {
    case SET_HISTORICAL_TOURS:
      return { ...state, [action.mlsNumber]: action.tours };
    case ADD_HISTORICAL_TOUR: {
      // one per agent per listing — replace if exists
      const existing = (state[action.mlsNumber] || []).filter(t => t.agent_id !== action.tour.agent_id);
      return { ...state, [action.mlsNumber]: [action.tour, ...existing] };
    }
    case REMOVE_HISTORICAL_TOUR: {
      const existing = state[action.mlsNumber] || [];
      return { ...state, [action.mlsNumber]: existing.filter(t => t.id !== action.tourId) };
    }
    default:
      return state;
  }
}
