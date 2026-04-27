/** @type {import('tailwindcss').Config} */
module.exports = {
	content: ["./src/**/*.{js,jsx,ts,tsx}"],
	theme: {
		extend: {
			fontFamily: {
				sans: ["Inter", "Geist", "system-ui", "sans-serif"],
			},
			colors: {
				canvas: "#FFFFFF",
				surface: "#F9FAFB",
				ink: "#0F172A",
				inkMuted: "#64748B",
				cta: "#111111",
				stroke: "#F1F5F9",
			},
			borderRadius: {
				xl: "12px",
				"2xl": "16px",
			},
			boxShadow: {
				softSm: "0 2px 10px rgb(0 0 0 / 0.03)",
				softMd: "0 8px 30px rgb(0 0 0 / 0.04)",
				softLg: "0 16px 40px rgb(0 0 0 / 0.06)",
			},
		},
	},
	plugins: [],
};
