const LogoBrand = () => (
	<div className="flex flex-col items-center md:flex-row md:items-baseline md:gap-3">
		<div className="flex items-center gap-2">
			{/* Show only the T-box icon (top ~75% of logo.png), hide the "tourit.ca" text below */}
			<div style={{ width: 32, height: 32, overflow: 'hidden', flexShrink: 0 }}>
				<img
					src="/logo.png"
					alt="Tourit logo"
					style={{ width: 32, height: 43, objectFit: 'cover', objectPosition: 'top', filter: 'invert(1)' }}
				/>
			</div>
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
