import React from "react";
import { render } from "@testing-library/react";
import PropertyCard from "../components/Search/List/PropertyCard";

const mockProperty = {
	id: 1,
	status: "Active",
	price: 850000,
	bed: 3,
	bath: 2,
	sqft: 1500,
	street: "123 Main St",
	city: "Toronto",
	state: "ON",
	zip: "M1A 1A1",
	listing_date: "2024-01-15",
	front_img: null,
	image_urls: [],
	office: "Test Realty",
};

jest.mock("../context/Modal", () => ({
	Modal: ({ children }) => <div>{children}</div>,
}));
jest.mock("../components/Property", () => () => <div>Property</div>);

describe("Task 1 — Sidebar card cleanup", () => {
	it('does not render "House for Sale" label', () => {
		const { queryByText } = render(
			<PropertyCard property={mockProperty} setOver={() => {}} />
		);
		expect(queryByText(/house for sale/i)).toBeNull();
	});

	it('does not render "Listed on" date badge', () => {
		const { queryByText } = render(
			<PropertyCard property={mockProperty} setOver={() => {}} />
		);
		expect(queryByText(/listed on/i)).toBeNull();
	});

	it("renders price and address", () => {
		const { getByText } = render(
			<PropertyCard property={mockProperty} setOver={() => {}} />
		);
		expect(getByText(/850,000/)).toBeTruthy();
		expect(getByText(/123 Main St/)).toBeTruthy();
	});
});
