import { useState } from "react";
import ReactDOM from "react-dom";

const PRICE_MAX  = 5_000_000;
const SQFT_MAX   = 10_000;
const YEAR_MIN   = 1900;
const YEAR_MAX   = new Date().getFullYear();
const STRATA_MAX = 2_000;

// ── helpers ──────────────────────────────────────────────────────────────────

const fmtPrice = (v, isMax) => {
	if (!isMax && v === 0)          return "No Min";
	if (isMax  && v >= PRICE_MAX)   return "No Max";
	if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1)}M`;
	if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}K`;
	return `$${v}`;
};

const fmtSqft = (v, isMax) => {
	if (!isMax && v === 0)        return "No Min";
	if (isMax  && v >= SQFT_MAX)  return "No Max";
	return v.toLocaleString();
};

const fmtYear = (v, isMax) => {
	if (!isMax && v <= YEAR_MIN) return "No Min";
	if (isMax  && v >= YEAR_MAX) return "No Max";
	return v;
};

const fmtStrata = (v, isMax) => {
	if (!isMax && v === 0)          return "No Min";
	if (isMax  && v >= STRATA_MAX)  return "No Max";
	return `$${v}`;
};

// ── sub-components ────────────────────────────────────────────────────────────

const DualSlider = ({ low, high, min, max, step = 1, setLow, setHigh }) => {
	const lp = ((low  - min) / (max - min)) * 100;
	const hp = ((high - min) / (max - min)) * 100;
	return (
		<div className="relative h-7 mx-1">
			<div className="absolute top-1/2 -translate-y-1/2 inset-x-0 h-[3px] rounded-full bg-[#d8d8d0]" />
			<div
				className="absolute top-1/2 -translate-y-1/2 h-[3px] rounded-full bg-[#1a1a1a]"
				style={{ left: `${lp}%`, right: `${100 - hp}%` }}
			/>
			<input type="range" min={min} max={max} step={step} value={low}
				onChange={e => setLow(Math.min(+e.target.value, high - step))}
				className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
				style={{ zIndex: lp > 90 ? 5 : 3 }}
			/>
			<input type="range" min={min} max={max} step={step} value={high}
				onChange={e => setHigh(Math.max(+e.target.value, low + step))}
				className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
				style={{ zIndex: 4 }}
			/>
			<div className="absolute top-1/2 w-5 h-5 rounded-full bg-white border border-[#1a1a1a] shadow-sm pointer-events-none"
				style={{ left: `${lp}%`, transform: "translate(-50%, -50%)" }} />
			<div className="absolute top-1/2 w-5 h-5 rounded-full bg-white border border-[#1a1a1a] shadow-sm pointer-events-none"
				style={{ left: `${hp}%`, transform: "translate(-50%, -50%)" }} />
		</div>
	);
};

const RangeRow = ({ leftLabel, rightLabel, leftVal, rightVal, leftSuffix, rightSuffix }) => (
	<div className="flex items-center gap-2 mb-3">
		<div className="flex-1">
			<div className="text-[11px] text-[#999] mb-1">{leftLabel}</div>
			<div className="bg-white border border-[#ddddd6] rounded-lg px-3 py-2.5 text-sm text-[#1a1a1a] flex justify-between items-center">
				<span>{leftVal}</span>
				{leftSuffix && <span className="text-[#b0b0a8] text-xs">{leftSuffix}</span>}
			</div>
		</div>
		<span className="text-[#aaa] text-sm mt-5">-</span>
		<div className="flex-1">
			<div className="text-[11px] text-[#999] mb-1">{rightLabel}</div>
			<div className="bg-white border border-[#ddddd6] rounded-lg px-3 py-2.5 text-sm text-[#1a1a1a] flex justify-between items-center">
				<span>{rightVal}</span>
				{rightSuffix && <span className="text-[#b0b0a8] text-xs">{rightSuffix}</span>}
			</div>
		</div>
	</div>
);

const Divider = () => <div className="border-t border-[#e0e0d8]" />;

const SectionHead = ({ title, hint }) => (
	<div className="flex items-baseline gap-2 mb-3">
		<h3 className="text-[17px] font-bold text-[#1a1a1a]">{title}</h3>
		{hint && <span className="text-[12px] text-[#aaa]">{hint}</span>}
	</div>
);

const SELECTED_CLS = "border-[#d4a017] bg-[#fffdf5] text-[#1a1a1a] font-semibold";
const DEFAULT_CLS  = "border-[#ddddd6] bg-white text-[#3a3a3a]";

const BtnStrip = ({ options, value, onChange }) => (
	<div className="flex gap-2 flex-wrap">
		{options.map(opt => (
			<button key={opt.value} type="button"
				onClick={() => onChange(opt.value)}
				className={`px-3.5 py-2 rounded-lg border text-sm transition min-w-[52px] ${value === opt.value ? SELECTED_CLS : DEFAULT_CLS}`}
			>
				{opt.label}
			</button>
		))}
	</div>
);

// ── data ──────────────────────────────────────────────────────────────────────

const PROP_TYPES = [
	{ label: "Condo",        value: "Condominium",      icon: "fa-building" },
	{ label: "House",        value: "Single Family",    icon: "fa-house" },
	{ label: "Townhouse",    value: "Townhouse",        icon: "fa-city" },
	{ label: "Multi-family", value: "Multi Family",     icon: "fa-people-roof" },
	{ label: "Mobile",       value: "Manufactured Home",icon: "fa-caravan" },
	{ label: "Rec",          value: "Recreation",       icon: "fa-campground" },
	{ label: "Land",         value: "Land",             icon: "fa-seedling" },
	{ label: "Other",        value: "Other",            icon: "fa-circle-question" },
];

const BED_OPTIONS = [
	{ label: "Any",    value: 0 },
	{ label: "Studio", value: -1 },
	{ label: "1",      value: 1 },
	{ label: "2",      value: 2 },
	{ label: "3",      value: 3 },
	{ label: "4",      value: 4 },
	{ label: "5+",     value: 5 },
];

const BATH_OPTIONS = [
	{ label: "Any", value: 0 },
	{ label: "1+",  value: 1 },
	{ label: "2+",  value: 2 },
	{ label: "3+",  value: 3 },
	{ label: "4+",  value: 4 },
	{ label: "5+",  value: 5 },
];

const DAYS_OPTIONS = [
	{ label: "Any",     value: 0 },
	{ label: "24 hrs",  value: 1 },
	{ label: "7 days",  value: 7 },
	{ label: "14 days", value: 14 },
	{ label: "28 days", value: 28 },
];

const TITLE_OPTIONS = [
	{ label: "Any",                  value: "" },
	{ label: "Freehold",             value: "Freehold" },
	{ label: "Leasehold",            value: "Leasehold" },
	{ label: "Timeshare/Fractional", value: "Timeshare" },
	{ label: "Co-Operative",         value: "Co-Op" },
];

// ── main component ────────────────────────────────────────────────────────────

const FilterPanel = ({ min, setMin, max, setMax, type, setType, bed, setBed, bath, setBath, onClose }) => {
	const [priceMin, setPriceMin] = useState(Math.min(min,  PRICE_MAX));
	const [priceMax, setPriceMax] = useState(Math.min(max >= 99999999 ? PRICE_MAX : max, PRICE_MAX));

	const [sqftMin,   setSqftMin]   = useState(0);
	const [sqftMax,   setSqftMax]   = useState(SQFT_MAX);
	const [yearMin,   setYearMin]   = useState(YEAR_MIN);
	const [yearMax,   setYearMax]   = useState(YEAR_MAX);
	const [strataMin, setStrataMin] = useState(0);
	const [strataMax, setStrataMax] = useState(STRATA_MAX);
	const [daysOnSite,  setDaysOnSite]  = useState(0);
	const [titleStatus, setTitleStatus] = useState("");

	const handleDone = () => {
		setMin(priceMin);
		setMax(priceMax >= PRICE_MAX ? 99999999999 : priceMax);
		onClose();
	};

	const handleClear = () => {
		setPriceMin(0);  setPriceMax(PRICE_MAX);
		setMin(0);       setMax(99999999999);
		setType("");     setBed(0);   setBath(0);
		setSqftMin(0);   setSqftMax(SQFT_MAX);
		setYearMin(YEAR_MIN); setYearMax(YEAR_MAX);
		setStrataMin(0); setStrataMax(STRATA_MAX);
		setDaysOnSite(0); setTitleStatus("");
	};

	return ReactDOM.createPortal(
		<div className="fixed inset-0 z-[9999] flex justify-end">
			<div className="absolute inset-0 bg-black/25" onClick={onClose} />

			<div className="relative flex flex-col w-full max-w-[600px] h-full bg-[#f5f5f0] shadow-2xl">
				{/* Header */}
				<div className="flex items-center justify-between px-6 pt-5 pb-4">
					<h2 className="text-[22px] font-bold text-[#1a1a1a]">Filters</h2>
					<button type="button" onClick={onClose}
						className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#e8e8e2] text-[#555] transition">
						<i className="fa-solid fa-xmark" />
					</button>
				</div>

				{/* Scrollable body */}
				<div className="flex-1 overflow-y-auto px-6 pb-4 space-y-5">

					{/* Price Range */}
					<section>
						<SectionHead title="Price range" />
						<RangeRow
							leftLabel="Minimum"  leftVal={fmtPrice(priceMin, false)}
							rightLabel="Maximum" rightVal={fmtPrice(priceMax, true)}
						/>
						<DualSlider low={priceMin} high={priceMax}
							min={0} max={PRICE_MAX} step={10_000}
							setLow={setPriceMin} setHigh={setPriceMax} />
					</section>

					<Divider />

					{/* Property Type */}
					<section>
						<SectionHead title="Property Type" />
						<div className="flex flex-wrap gap-2">
							{PROP_TYPES.map(pt => (
								<button key={pt.value} type="button"
									onClick={() => setType(type === pt.value ? "" : pt.value)}
									className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition
										${type === pt.value ? SELECTED_CLS : DEFAULT_CLS}`}
								>
									<i className={`fa-solid ${pt.icon} text-[12px] text-[#aaa]`} />
									{pt.label}
								</button>
							))}
						</div>
					</section>

					<Divider />

					{/* Bedrooms */}
					<section>
						<SectionHead title="Bedrooms" hint="Tap two numbers to select a range" />
						<BtnStrip options={BED_OPTIONS} value={bed} onChange={setBed} />
					</section>

					{/* Bathrooms */}
					<section>
						<SectionHead title="Bathrooms" />
						<BtnStrip options={BATH_OPTIONS} value={bath} onChange={setBath} />
					</section>

					<Divider />

					{/* Additional property details */}
					<section>
						<SectionHead title="Additional property details" />

						{/* SQFT */}
						<div className="mb-5">
							<RangeRow
								leftLabel="SQFT Min"  leftVal={fmtSqft(sqftMin, false)} leftSuffix="sqft"
								rightLabel="SQFT Max" rightVal={fmtSqft(sqftMax, true)}  rightSuffix="sqft"
							/>
							<DualSlider low={sqftMin} high={sqftMax}
								min={0} max={SQFT_MAX} step={100}
								setLow={setSqftMin} setHigh={setSqftMax} />
						</div>

						{/* Year Built */}
						<div className="mb-5">
							<RangeRow
								leftLabel="Year Built Min"  leftVal={fmtYear(yearMin, false)}
								rightLabel="Year Built Max" rightVal={fmtYear(yearMax, true)}
							/>
							<DualSlider low={yearMin} high={yearMax}
								min={YEAR_MIN} max={YEAR_MAX} step={1}
								setLow={setYearMin} setHigh={setYearMax} />
						</div>

						{/* Strata Fee */}
						<div>
							<RangeRow
								leftLabel="Strata Fee Min"  leftVal={fmtStrata(strataMin, false)} leftSuffix="mo"
								rightLabel="Strata Fee Max" rightVal={fmtStrata(strataMax, true)}  rightSuffix="mo"
							/>
							<DualSlider low={strataMin} high={strataMax}
								min={0} max={STRATA_MAX} step={50}
								setLow={setStrataMin} setHigh={setStrataMax} />
						</div>
					</section>

					<Divider />

					{/* Days on site */}
					<section>
						<SectionHead title="Days on site" />
						<BtnStrip options={DAYS_OPTIONS} value={daysOnSite} onChange={setDaysOnSite} />
					</section>

					<Divider />

					{/* Title Status */}
					<section>
						<SectionHead title="Title Status" />
						<div className="flex flex-wrap gap-2">
							{TITLE_OPTIONS.map(opt => (
								<button key={opt.value} type="button"
									onClick={() => setTitleStatus(opt.value)}
									className={`px-4 py-2 rounded-lg border text-sm transition
										${titleStatus === opt.value ? SELECTED_CLS : DEFAULT_CLS}`}
								>
									{opt.label}
								</button>
							))}
						</div>
					</section>
				</div>

				{/* Footer */}
				<div className="flex items-center justify-between px-6 py-4 border-t border-[#e0e0d8] bg-[#f5f5f0]">
					<button type="button" onClick={handleClear}
						className="text-[12px] font-bold uppercase tracking-widest text-[#555] hover:text-[#111] transition">
						Clear Filters
					</button>
					<button type="button" onClick={handleDone}
						className="bg-[#1a1a1a] text-white px-8 py-2.5 rounded-lg text-sm font-bold uppercase tracking-wide hover:bg-black transition">
						Done
					</button>
				</div>
			</div>
		</div>,
		document.body
	);
};

export default FilterPanel;
