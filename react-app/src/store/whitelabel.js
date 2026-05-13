import apiFetch from "../utils/apiFetch";
import { getWhitelabelSlug } from "../utils/whitelabel";

const SET_WHITELABEL_AGENT = "whitelabel/SET_WHITELABEL_AGENT";

const setWhitelabelAgent = (agent) => ({ type: SET_WHITELABEL_AGENT, agent });

export const initWhitelabel = () => async (dispatch) => {
  const slug = getWhitelabelSlug();
  if (!slug) return;
  try {
    const res = await apiFetch(`/api/agents/slug/${encodeURIComponent(slug)}`);
    if (res.ok) {
      const data = await res.json();
      dispatch(setWhitelabelAgent(data.agent || null));
    }
  } catch {
    // non-whitelabel domain — ignore silently
  }
};

const initialState = { agent: null };

export default function whitelabelReducer(state = initialState, action) {
  switch (action.type) {
    case SET_WHITELABEL_AGENT:
      return { ...state, agent: action.agent };
    default:
      return state;
  }
}
