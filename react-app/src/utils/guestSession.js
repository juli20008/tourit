const KEY     = "tourit_guest_id";
const TTL_KEY = "tourit_guest_id_exp";
const TTL_MS  = 30 * 24 * 60 * 60 * 1000; // 30 days

export function getGuestId() {
	const exp = localStorage.getItem(TTL_KEY);
	if (exp && Date.now() > parseInt(exp, 10)) {
		localStorage.removeItem(KEY);
		localStorage.removeItem(TTL_KEY);
	}
	let id = localStorage.getItem(KEY);
	if (!id) {
		id = typeof crypto !== "undefined" && crypto.randomUUID
			? crypto.randomUUID()
			: `g${Date.now()}-${Math.random().toString(36).slice(2)}`;
		localStorage.setItem(KEY, id);
		localStorage.setItem(TTL_KEY, String(Date.now() + TTL_MS));
	}
	return id;
}
