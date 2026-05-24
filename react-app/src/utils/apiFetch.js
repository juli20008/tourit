const rawApiBase = process.env.REACT_APP_API_URL || "";
const API_BASE = (() => {
	if (rawApiBase) {
		return rawApiBase.replace(/^http:\/\//i, "https://").replace(/\/$/, "");
	}
	if (typeof window !== "undefined" && window.location.hostname === "localhost") {
		return "";
	}
	return "https://api.tourit.ca";
})();

// Retries once after a network failure or 5xx so a cold-start stall
// doesn't surface as a visible error on the first real request.
const apiFetch = async (path, options = {}, _retry = true) => {
	const opts = API_BASE
		? { credentials: "include", ...options }
		: options;
	try {
		const res = await fetch(`${API_BASE}${path}`, opts);
		if (_retry && res.status >= 500) {
			await new Promise((r) => setTimeout(r, 1500));
			return apiFetch(path, options, false);
		}
		return res;
	} catch (err) {
		if (_retry) {
			await new Promise((r) => setTimeout(r, 1500));
			return apiFetch(path, options, false);
		}
		throw err;
	}
};

export default apiFetch;
