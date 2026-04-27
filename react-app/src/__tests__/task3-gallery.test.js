import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import Images from "../components/Property/Images";

const mockProperty = {
	id: 1,
	front_img: "https://example.com/hero.jpg",
	image_urls: [
		"https://example.com/thumb1.jpg",
		"https://example.com/thumb2.jpg",
		"https://example.com/thumb3.jpg",
	],
};

describe("Task 3 — Gallery navigation", () => {
	it("renders left and right arrow buttons", () => {
		render(<Images property={mockProperty} />);
		expect(screen.getByLabelText("Previous photo")).toBeTruthy();
		expect(screen.getByLabelText("Next photo")).toBeTruthy();
	});

	it("shows photo counter", () => {
		render(<Images property={mockProperty} />);
		expect(screen.getByText(/1 \/ 4 photos/)).toBeTruthy();
	});

	it("clicking next arrow increments counter", () => {
		render(<Images property={mockProperty} />);
		fireEvent.click(screen.getByLabelText("Next photo"));
		expect(screen.getByText(/2 \/ 4 photos/)).toBeTruthy();
	});

	it("does not open a lightbox modal on hero click", () => {
		const { container } = render(<Images property={mockProperty} />);
		// Hero image div is the first child of the wrapper — clicking it should NOT open a modal
		const hero = container.querySelector(".relative.w-full");
		fireEvent.click(hero);
		// No modal portal rendered
		expect(document.querySelector(".modal-background")).toBeNull();
	});
});
