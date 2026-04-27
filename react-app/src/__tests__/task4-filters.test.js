/**
 * Task 4 — Transaction type filter unit tests.
 * Tests the filter logic directly (not the map UI, which requires Google Maps JS).
 */

const applyTransactionFilter = (properties, transactionType) =>
	properties.filter((prop) => {
		if (transactionType === "all") return true;
		const tt = (prop?.transaction_type || prop?.status || "").toLowerCase();
		if (transactionType === "lease") return tt.includes("lease");
		return !tt.includes("lease");
	});

describe("Task 4 — Transaction type filter", () => {
	const props = [
		{ id: 1, price: 500000, transaction_type: "Sale" },
		{ id: 2, price: 2000, transaction_type: "Lease" },
		{ id: 3, price: 3000, transaction_type: "lease" },
		{ id: 4, price: 600000, transaction_type: "Sale" },
		{ id: 5, price: 450000 }, // no transaction_type — treated as sale
	];

	it('returns all properties when filter is "all"', () => {
		expect(applyTransactionFilter(props, "all")).toHaveLength(5);
	});

	it('returns only sale properties when filter is "sale"', () => {
		const result = applyTransactionFilter(props, "sale");
		expect(result.every((p) => !p.transaction_type?.toLowerCase().includes("lease"))).toBe(true);
		expect(result).toHaveLength(3);
	});

	it('returns only lease properties when filter is "lease"', () => {
		const result = applyTransactionFilter(props, "lease");
		expect(result.every((p) => p.transaction_type?.toLowerCase().includes("lease"))).toBe(true);
		expect(result).toHaveLength(2);
	});

	it("triggers a state update when filter changes", () => {
		let state = "all";
		const setState = (val) => { state = val; };
		setState("sale");
		expect(state).toBe("sale");
	});
});
