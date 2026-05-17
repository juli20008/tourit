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
		const { index, ts } = JSON.parse(raw);
		if (Array.isArray(index) && index.length && Date.now() - ts < CACHE_TTL)
			return index;
	} catch {}
	return null;
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
	if (_index) return Promise.resolve(_index);

	const cached = readCache();
	if (cached) {
		_index = cached;
		// Still refresh in background so the next session gets fresh data
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
 * Matches on "street city" so "123 King Toronto" works.
 */
export function searchAddr(query, limit = 6) {
	if (!_index) _index = readCache(); // parse localStorage once, then stay in memory
	const idx = _index;
	if (!idx || !query || query.trim().length < 2) return [];
	const q = query.trim().toLowerCase();
	const results = [];
	for (const l of idx) {
		if (!l.street) continue;
		const hay = `${l.street} ${l.city}`.toLowerCase();
		if (hay.includes(q)) {
			results.push(l);
			if (results.length >= limit) break;
		}
	}
	return results;
}
