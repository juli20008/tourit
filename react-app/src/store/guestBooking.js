import apiFetch from "../utils/apiFetch";

export const createGuestBooking = (payload) => async () => {
	try {
		const res = await apiFetch("/api/guest/book", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});
		return res.json();
	} catch {
		return { errors: ["Network error"] };
	}
};

export const captureGuestContact = (payload) => async () => {
	try {
		const res = await apiFetch("/api/guest/contact", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});
		return res.json();
	} catch {
		return { errors: ["Network error"] };
	}
};
