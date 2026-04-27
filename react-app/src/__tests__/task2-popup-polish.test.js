import React from "react";
import { render, screen } from "@testing-library/react";
import PropertyPreviewList from "../components/Search/Map/PropertyPreviewList";

const mockProperties = [
	{
		id: 1,
		price: 750000,
		status: "Active",
		street: "45 Oak Ave",
		city: "Toronto",
		bed: 2,
		bath: 1,
		sqft: 900,
		image_urls: [],
		front_img: null,
	},
];

describe("Task 2 — Popup polish", () => {
	it("renders without heart/save button", () => {
		const { container } = render(
			<PropertyPreviewList properties={mockProperties} onSelect={() => {}} />
		);
		expect(container.querySelector('[aria-label="Save property"]')).toBeNull();
	});

	it("renders property price", () => {
		render(
			<PropertyPreviewList properties={mockProperties} onSelect={() => {}} />
		);
		expect(screen.getByText(/750,000/)).toBeTruthy();
	});

	it("renders without Save Search button", () => {
		const { queryByText } = render(
			<PropertyPreviewList properties={mockProperties} onSelect={() => {}} />
		);
		expect(queryByText(/save search/i)).toBeNull();
	});
});
