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

// ── Internal search helper ────────────────────────────────────────────────

function _runSearch(idx, numTokens, textTokens, cap) {
	const results = [];
	for (const l of idx) {
		if (!l.street) continue;
		const streetLow = l.street.toLowerCase();
		const hay       = `${streetLow} ${(l.city || "").toLowerCase()}`;

		if (numTokens.length) {
			const streetNum = streetLow.split(/\s+/)[0] || "";
			const ok = numTokens.every(t => {
				if (!streetNum.startsWith(t)) return false;
				const next = streetNum[t.length];
				return !next || /[a-z\-]/i.test(next); // next char must not be a digit
			});
			if (!ok) continue;
		}

		if (textTokens.length && !textTokens.every(t => hay.includes(t))) continue;

		results.push(l);
		if (results.length >= cap) break;
	}
	return results;
}

/**
 * Synchronous search against the loaded index. Returns [] if index not ready.
 *
 * Two-pass strategy:
 *   Pass 1 — exact street-number boundary match + text in street+city.
 *             "3" matches "3 Hollingsworth" but NOT "30", "32", "34".
 *   Pass 2 — if Pass 1 is empty AND a text token is ≥ 4 chars, drop the
 *             number constraint and search by street name only, then sort
 *             results by how close their street number is to the searched
 *             number.  "5 tottenham" falls back to all Tottenham listings
 *             sorted closest to #5 first.
 *
 * Also handles MLS# lookup: purely numeric query ≥ 5 digits → search
 * mls_number field directly.
 */
export function searchAddr(query, limit = 6) {
	if (!_index) _index = readCache();
	const idx = _index;
	if (!idx || !query || query.trim().length < 2) return [];

	const q      = query.trim().toLowerCase();
	const tokens = q.split(/\s+/).filter(Boolean);
	if (!tokens.length) return [];

	// MLS# search — pure digits (possibly with dashes/spaces), ≥ 5 chars
	const mlsRaw = q.replace(/[\s\-]/g, "");
	if (/^\d{5,}$/.test(mlsRaw)) {
		const found = [];
		for (const l of idx) {
			if (l.mls_number && String(l.mls_number).includes(mlsRaw)) {
				found.push(l);
				if (found.length >= limit) break;
			}
		}
		if (found.length) return found;
	}

	const numTokens  = tokens.filter(t => /^\d/.test(t));
	const textTokens = tokens.filter(t => !/^\d/.test(t));

	// Pass 1: exact number boundary + text in street+city
	const exact = _runSearch(idx, numTokens, textTokens, limit);
	if (exact.length) return exact;

	// Pass 2: if searching by address (has a number) and at least one meaningful
	// text token (≥ 4 chars), fall back to street-name-only and sort by proximity
	// to the requested house number so the closest matches rise to the top.
	if (numTokens.length && textTokens.some(t => t.length >= 4)) {
		const target  = parseInt(numTokens[0], 10) || 0;
		const pool    = _runSearch(idx, [], textTokens, limit * 4); // grab more to sort
		if (pool.length) {
			pool.sort((a, b) => {
				const aN = parseInt(a.street, 10) || 0;
				const bN = parseInt(b.street, 10) || 0;
				return Math.abs(aN - target) - Math.abs(bN - target);
			});
			return pool.slice(0, limit);
		}
	}

	return [];
}
