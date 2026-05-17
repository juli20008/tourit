import apiFetch from "./apiFetch";

const CACHE_KEY = "tourit_addr_idx";
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// Module-level singleton — one fetch shared across all component instances.
let _index = null;
let _fetchPromise = null;

function readCache() {
	try {
		const raw = localStorage.getItem(CACHE_KEY);
		if (!raw) return null;
		const { index } = JSON.parse(raw);
		// Return stale cache too — always refresh in background (stale-while-revalidate)
		if (Array.isArray(index) && index.length) return index;
	} catch {}
	return null;
}

function cacheIsStale() {
	try {
		const raw = localStorage.getItem(CACHE_KEY);
		if (!raw) return true;
		const { ts } = JSON.parse(raw);
		return Date.now() - ts >= CACHE_TTL;
	} catch {}
	return true;
}

function writeCache(index) {
	try {
		localStorage.setItem(CACHE_KEY, JSON.stringify({ index, ts: Date.now() }));
	} catch {}
}

/**
 * Ensures the address index is loaded. Returns a Promise<array>.
 * Multiple callers share the same in-flight fetch; cache-first on repeat calls.
 */
export function ensureAddrIndex() {
	if (_index) {
		// Refresh stale cache in background without blocking
		if (!_fetchPromise && cacheIsStale()) {
			_fetchPromise = apiFetch("/api/listings/address-index")
				.then((r) => r.json())
				.then((data) => {
					const idx = data.index || [];
					if (idx.length) { _index = idx; writeCache(idx); }
					return _index;
				})
				.catch(() => _index)
				.finally(() => { _fetchPromise = null; });
		}
		return Promise.resolve(_index);
	}

	const cached = readCache();
	if (cached) {
		_index = cached;
		// Always refresh in background (stale-while-revalidate)
		if (!_fetchPromise) {
			_fetchPromise = apiFetch("/api/listings/address-index")
				.then((r) => r.json())
				.then((data) => {
					const idx = data.index || [];
					if (idx.length) { _index = idx; writeCache(idx); }
					return _index;
				})
				.catch(() => _index)
				.finally(() => { _fetchPromise = null; });
		}
		return Promise.resolve(_index);
	}

	if (!_fetchPromise) {
		_fetchPromise = apiFetch("/api/listings/address-index")
			.then((r) => r.json())
			.then((data) => {
				const idx = data.index || [];
				if (idx.length) { _index = idx; writeCache(idx); }
				return _index || [];
			})
			.catch(() => [])
			.finally(() => { _fetchPromise = null; });
	}

	return _fetchPromise;
}

/**
 * Synchronous search against the loaded index. Returns [] if index not ready.
 *
 * Matching strategy:
 * - Split query into numeric tokens ("3", "34") and text tokens ("holling")
 * - Numeric tokens must match the STREET NUMBER exactly (whole-word boundary):
 *     "3" matches "3 Hollingsworth" and "3A Hollingsworth" but NOT "30" or "34"
 * - Text tokens must appear in the street name (not city) when the query has a
 *   numeric part, preventing "tor" from matching any Toronto listing.
 * - For pure-text queries (no numbers), text tokens match street + city so that
 *   "toronto" or "scarborough" surface all listings in that city.
 */
export function searchAddr(query, limit = 6) {
	if (!_index) _index = readCache(); // parse localStorage once, then stay in memory
	const idx = _index;
	if (!idx || !query || query.trim().length < 2) return [];

	const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
	if (!tokens.length) return [];

	// Separate numeric tokens (likely street numbers) from text tokens.
	const numTokens  = tokens.filter(t => /^\d/.test(t));
	const textTokens = tokens.filter(t => !/^\d/.test(t));

	const results = [];
	for (const l of idx) {
		if (!l.street) continue;
		const streetLow = l.street.toLowerCase(); // e.g. "3 hollingsworth st"
		const cityLow   = (l.city || "").toLowerCase();

		// Numeric tokens: match the street number as a whole "word" (not substring).
		// "3" must match "3 …" or "3A …" but NOT "30 …" or "34 …".
		if (numTokens.length) {
			const streetNum = streetLow.split(/\s+/)[0] || ""; // first token = house number
			const ok = numTokens.every(t => {
				if (!streetNum.startsWith(t)) return false;
				const next = streetNum[t.length];
				return !next || /[a-z\-]/i.test(next); // next char must be letter/hyphen, not digit
			});
			if (!ok) continue;
		}

		// Text tokens: when combined with a number (address search) only match the
		// street, not the city — prevents "tor" from matching every Toronto listing.
		if (textTokens.length) {
			const textHay = numTokens.length > 0 ? streetLow : `${streetLow} ${cityLow}`;
			if (!textTokens.every(t => textHay.includes(t))) continue;
		}

		results.push(l);
		if (results.length >= limit) break;
	}
	return results;
}
