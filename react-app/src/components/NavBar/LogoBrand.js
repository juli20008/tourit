// House/Y mark extracted from logo-white.svg (Layer_3, viewBox 0 0 114 124)
const HouseIcon = () => (
	<svg width="22" height="22" viewBox="0 0 114 124" fill="white" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
		<polygon points="72.88 89.97 72.88 122.83 112.54 122.94 112.54 44.19 72.88 89.97" />
		<polygon points="1.49 44.3 1.15 122.6 41.15 122.72 41.15 89.97 1.49 44.3" />
		<polygon points="57.01 70.82 77.75 44.19 112.54 44.19 57.92 0 1.49 43.85 1.49 44.19 36.51 44.19 57.01 70.82" />
	</svg>
);

const LogoBrand = () => (
	<div className="flex flex-col items-center md:flex-row md:items-baseline md:gap-3">
		<div className="flex items-center gap-2">
			<HouseIcon />
			<span
				style={{ fontFamily: "'Outfit', 'DM Sans', system-ui, sans-serif", fontWeight: 400, letterSpacing: '0.01em' }}
				className="text-[24px] md:text-[30px] leading-none text-white"
			>
				tourit.ca
			</span>
		</div>
		<span className="nav-slogan">Instant Bookings with Trusted Local Realtors</span>
	</div>
);

export default LogoBrand;
