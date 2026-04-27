/**
 * Wraps the native fetch() so every /api/... call is prefixed with
 * REACT_APP_API_URL in production (Vercel → Render).
 *
 * In development the value is "" (empty string), so relative paths work
 * unchanged through the CRA proxy ("proxy": "http://localhost:5000").
 *
 * credentials: 'include' is required in production so the browser sends
 * the Flask session cookie on cross-origin requests (Vercel → Render).
 */
const API_BASE = process.env.REACT_APP_API_URL || "";

const apiFetch = (path, options = {}) => {
	const opts = API_BASE
		? { credentials: "include", ...options }
		: options;
	return fetch(`${API_BASE}${path}`, opts);
};

export default apiFetch;
