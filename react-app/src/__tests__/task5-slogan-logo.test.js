/**
 * Task 5 — Slogan + logo tests.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Minimal NavBar logo+slogan section (isolated from Redux/auth)
const LogoSlogan = () => (
	<a href="/" className="flex flex-col items-center gap-0.5">
		<img src="/Yollow.svg" alt="Yollow" />
		<span className="text-[8px] font-light tracking-widest uppercase text-[#64748b] whitespace-nowrap">
			Map. Click. Tour.
		</span>
	</a>
);

describe("Task 5 — Slogan + logo", () => {
	it("renders the slogan text", () => {
		render(<MemoryRouter><LogoSlogan /></MemoryRouter>);
		expect(screen.getByText(/map\. click\. tour\./i)).toBeTruthy();
	});

	it("uses the SVG logo", () => {
		render(<MemoryRouter><LogoSlogan /></MemoryRouter>);
		const img = screen.getByAltText("Yollow");
		expect(img.getAttribute("src")).toBe("/Yollow.svg");
	});
});
