const KEY = "tourit_location_consent";
const DAYS = 30;

export const hasConsented = () => {
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return false;
		const { ts } = JSON.parse(raw);
		return (Date.now() - ts) / 86400000 < DAYS;
	} catch {
		return false;
	}
};

export const saveConsent = () => {
	try {
		localStorage.setItem(KEY, JSON.stringify({ ts: Date.now() }));
	} catch {}
};

export const revokeConsent = () => {
	try {
		localStorage.removeItem(KEY);
	} catch {}
};
