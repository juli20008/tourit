const LogoBrand = () => (
	<div className="flex items-baseline gap-2 md:gap-3 whitespace-nowrap">
		<span
			style={{ fontFamily: "'DM Sans', system-ui, sans-serif", fontWeight: 700 }}
			className="text-[24px] md:text-[30px] leading-none tracking-tight text-white"
		>
			Tourit.ca
		</span>
		<span className="hidden sm:inline text-[#cbd5e1] font-light text-sm md:text-base select-none">|</span>
			<span
			style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}
			className="hidden sm:inline text-[13px] md:text-[16px] leading-none tracking-wide text-white/80"
		>
			Home Tours Simplified.
		</span>
	</div>
);

export default LogoBrand;
