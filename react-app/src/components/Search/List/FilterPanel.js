import { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";

const BUY_PRICE_MAX  = 5_000_000;
const RENT_PRICE_MAX = 10_000;
const SQFT_MAX       = 25_000;
const YEAR_MIN       = 1900;
const YEAR_MAX       = new Date().getFullYear();
const STRATA_MAX     = 2_000;

// ── helpers ──────────────────────────────────────────────────────────────────

const fmtPrice = (v, isMax, priceMax) => {
	if (!isMax && v === 0)          return "No Min";
	if (isMax  && v >= priceMax)    return "No Max";
	if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1)}M`;
	if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}K`;
	return `$${v}`;
};

const fmtSqft = (v, isMax) => {
	if (!isMax && v === 0)        return "No Min";
	if (isMax  && v >= SQFT_MAX)  return "No Max";
	return v.toLocaleString();
};

const fmtStrata = (v, isMax) => {
	if (!isMax && v === 0)          return "No Min";
	if (isMax  && v >= STRATA_MAX)  return "No Max";
	return `$${v}`;
};

// ── sub-components ────────────────────────────────────────────────────────────

const DualSlider = ({ low, high, min, max, step = 1, setLow, setHigh }) => {
	const trackRef = useRef(null);
	const [dragging, setDragging] = useState(null);

	const clamp = (value) => Math.min(max, Math.max(min, value));
	const snap  = (value) => Math.round(value / step) * step;
	const valueToPct = (value) => ((value - min) / (max - min)) * 100;
	const pctToValue = (pct)   => snap(clamp(min + ((max - min) * pct) / 100));

	const moveHandle = (clientX, handle) => {
		if (!trackRef.current) return;
		const rect = trackRef.current.getBoundingClientRect();
		const pct  = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
		const next = pctToValue(pct);
		if (handle === "low")  { setLow(Math.min(next, high - step)); return; }
		setHigh(Math.max(next, low + step));
	};

	const startDrag = (handle) => (e) => {
		e.preventDefault(); e.stopPropagation();
		setDragging(handle);
		moveHandle(e.clientX, handle);
	};

	useEffect(() => {
		if (!dragging) return;
		const onMove = (e) => moveHandle(e.clientX, dragging);
		const onUp   = () => setDragging(null);
		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup",   onUp);
		window.addEventListener("pointercancel", onUp);
		return () => {
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup",   onUp);
			window.removeEventListener("pointercancel", onUp);
		};
	}, [dragging, low, high, min, max, step]);

	const handleTrackPointerDown = (e) => {
		if (e.target !== trackRef.current) return;
		const rect = trackRef.current.getBoundingClientRect();
		const pct  = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
		const next = pctToValue(pct);
		const handle = Math.abs(next - low) <= Math.abs(next - high) ? "low" : "high";
		setDragging(handle);
		moveHandle(e.clientX, handle);
	};

	const lp = valueToPct(low);
	const hp = valueToPct(high);

	return (
		<div ref={trackRef} className="relative h-7 mx-1 select-none touch-none" onPointerDown={handleTrackPointerDown}>
			<div className="absolute top-1/2 -translate-y-1/2 inset-x-0 h-[3px] rounded-full bg-[#d8d8d0]" />
			<div className="absolute top-1/2 -translate-y-1/2 h-[3px] rounded-full bg-[#1a1a1a]"
				style={{ left: `${lp}%`, right: `${100 - hp}%` }} />
			<div role="slider" aria-label="Lower range"
				className="absolute top-1/2 w-5 h-5 rounded-full bg-white border border-[#1a1a1a] shadow-sm cursor-grab active:cursor-grabbing"
				style={{ left: `${lp}%`, transform: "translate(-50%, -50%)", zIndex: dragging === "low" ? 6 : 4 }}
				onPointerDown={startDrag("low")} />
			<div role="slider" aria-label="Upper range"
				className="absolute top-1/2 w-5 h-5 rounded-full bg-white border border-[#1a1a1a] shadow-sm cursor-grab active:cursor-grabbing"
				style={{ left: `${hp}%`, transform: "translate(-50%, -50%)", zIndex: dragging === "high" ? 6 : 5 }}
				onPointerDown={startDrag("high")} />
		</div>
	);
};

const RangeRow = ({ leftLabel, rightLabel, leftVal, rightVal, leftSuffix, rightSuffix, onLeftChange, onRightChange }) => (
	<div className="flex items-center gap-2 mb-3">
		<div className="flex-1">
			<div className="text-[11px] text-[#999] mb-1">{leftLabel}</div>
			<div className="bg-white border border-[#ddddd6] rounded-lg px-3 py-2.5 text-sm text-[#1a1a1a] flex justify-between items-center">
				<input type="number"
					className="w-full outline-none bg-transparent text-sm text-[#1a1a1a] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
					value={leftVal} onChange={e => onLeftChange(+e.target.value)} placeholder="No Min" />
				{leftSuffix && <span className="text-[#b0b0a8] text-xs ml-1 flex-shrink-0">{leftSuffix}</span>}
			</div>
		</div>
		<span className="text-[#aaa] text-sm mt-5">–</span>
		<div className="flex-1">
			<div className="text-[11px] text-[#999] mb-1">{rightLabel}</div>
			<div className="bg-white border border-[#ddddd6] rounded-lg px-3 py-2.5 text-sm text-[#1a1a1a] flex justify-between items-center">
				<input type="number"
					className="w-full outline-none bg-transparent text-sm text-[#1a1a1a] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
					value={rightVal} onChange={e => onRightChange(+e.target.value)} placeholder="No Max" />
				{rightSuffix && <span className="text-[#b0b0a8] text-xs ml-1 flex-shrink-0">{rightSuffix}</span>}
			</div>
		</div>
	</div>
);

const Divider    = () => <div className="border-t border-[#e0e0d8]" />;
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
			<button key={opt.value} type="button" onClick={() => onChange(opt.value)}
				className={`px-3.5 py-2 rounded-lg border text-sm transition min-w-[52px] ${value === opt.value ? SELECTED_CLS : DEFAULT_CLS}`}>
				{opt.label}
			</button>
		))}
	</div>
);

// ── data ──────────────────────────────────────────────────────────────────────

const PROP_TYPES = [
	{ label: "Condo",        value: "Condo",         icon: "fa-building" },
	{ label: "House",        value: "House",          icon: "fa-house" },
	{ label: "Townhouse",    value: "Townhouse",      icon: "fa-city" },
];

const BED_OPTIONS = [
	{ label: "Any", value: 0 }, { label: "Studio", value: -1 },
	{ label: "1",   value: 1 }, { label: "2",      value: 2  },
	{ label: "3",   value: 3 }, { label: "4",      value: 4  },
	{ label: "5+",  value: 5 },
];

const BATH_OPTIONS = [
	{ label: "Any", value: 0 }, { label: "1+", value: 1 },
	{ label: "2+",  value: 2 }, { label: "3+", value: 3 },
	{ label: "4+",  value: 4 }, { label: "5+", value: 5 },
];

const TITLE_OPTIONS = [
	{ label: "Any",             value: ""   },
	{ label: "Freehold",        value: "3"  },
	{ label: "Condo",           value: "1"  },
	{ label: "Freehold + POTL", value: "13" },
	{ label: "Co-op",           value: "6"  },
];

// ── main component ─────────────────────────────────────────────────────────��──

const FilterPanel = ({
	min, setMin, max, setMax,
	type, setType,
	bed, setBed, bath, setBath,
	sqftMin, setSqftMin, sqftMax, setSqftMax,
	strataMin, setStrataMin, strataMax, setStrataMax,
	titleStatus, setTitleStatus,
	transactionType,
	onClose,
}) => {
	const isRent     = transactionType === "For Lease";
	const PRICE_MAX  = isRent ? RENT_PRICE_MAX : BUY_PRICE_MAX;
	const PRICE_STEP = isRent ? 100 : 10_000;

	// Price is applied on the fly — derive display values from parent state
	const priceMin = Math.min(min, PRICE_MAX);
	const priceMax = max >= 99_999_999 ? PRICE_MAX : Math.min(max, PRICE_MAX);

	const [localSqftMin,   setLocalSqftMin]   = useState(!sqftMin ? 0 : sqftMin);
	const [localSqftMax,   setLocalSqftMax]   = useState(!sqftMax || sqftMax >= 99999 ? SQFT_MAX : sqftMax);
	const [localStrataMin, setLocalStrataMin] = useState(!strataMin ? 0 : strataMin);
	const [localStrataMax, setLocalStrataMax] = useState(!strataMax || strataMax >= 99999 ? STRATA_MAX : strataMax);
	const [localTitle,     setLocalTitle]     = useState(titleStatus ?? "");

	// Reset price range only when transactionType actually changes (not on mount)
	const mountedRef = useRef(false);
	useEffect(() => {
		if (!mountedRef.current) { mountedRef.current = true; return; }
		setMin(0);
		setMax(99999999999);
	}, [isRent]); // eslint-disable-line react-hooks/exhaustive-deps

	const setPriceMin = (v) => setMin(v);
	const setPriceMax = (v) => setMax(v >= PRICE_MAX ? 99999999999 : v);

	const handleDone = () => {
		setSqftMin(localSqftMin);
		setSqftMax(localSqftMax >= SQFT_MAX ? 999999 : localSqftMax);
		setStrataMin(localStrataMin);
		setStrataMax(localStrataMax >= STRATA_MAX ? 999999 : localStrataMax);
		setTitleStatus(localTitle);
		onClose();
	};

	const handleClear = () => {
		setMin(0);            setMax(99999999999);
		setType("");          setBed(0);   setBath(0);
		setLocalSqftMin(0);   setLocalSqftMax(SQFT_MAX);
		setSqftMin(0);        setSqftMax(999999);
		setLocalStrataMin(0); setLocalStrataMax(STRATA_MAX);
		setStrataMin(0);      setStrataMax(999999);
		setLocalTitle("");    setTitleStatus("");
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
						<SectionHead title={isRent ? "Monthly Rent" : "Price Range"} />
						<RangeRow
							leftLabel="Minimum"   leftVal={priceMin}
							onLeftChange={v => setPriceMin(Math.max(0, Math.min(v, priceMax - PRICE_STEP)))}
							rightLabel="Maximum"  rightVal={priceMax}
							onRightChange={v => setPriceMax(Math.min(PRICE_MAX, Math.max(v, priceMin + PRICE_STEP)))}
							leftSuffix="$" rightSuffix="$"
						/>
						<DualSlider low={priceMin} high={priceMax}
							min={0} max={PRICE_MAX} step={PRICE_STEP}
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
										${type === pt.value ? SELECTED_CLS : DEFAULT_CLS}`}>
									<i className={`fa-solid ${pt.icon} text-[12px] text-[#aaa]`} />
									{pt.label}
								</button>
							))}
						</div>
					</section>

					<Divider />

					{/* Bedrooms */}
					<section>
						<SectionHead title="Bedrooms" />
						<BtnStrip options={BED_OPTIONS} value={bed} onChange={setBed} />
					</section>

					{/* Bathrooms */}
					<section>
						<SectionHead title="Bathrooms" />
						<BtnStrip options={BATH_OPTIONS} value={bath} onChange={setBath} />
					</section>

					<Divider />

					{/* Additional details */}
					<section>
						<SectionHead title="Additional details" />

						{/* SQFT */}
						<div className="mb-5">
							<p className="text-sm text-[#555] mb-2">Square Footage</p>
							<RangeRow
								leftLabel="SQFT Min"  leftVal={localSqftMin}
								onLeftChange={v => setLocalSqftMin(Math.max(0, Math.min(v, localSqftMax - 100)))}
								rightLabel="SQFT Max" rightVal={localSqftMax}
								onRightChange={v => setLocalSqftMax(Math.min(SQFT_MAX, Math.max(v, localSqftMin + 100)))}
								leftSuffix="sqft" rightSuffix="sqft"
							/>
							<DualSlider low={localSqftMin} high={localSqftMax}
								min={0} max={SQFT_MAX} step={100}
								setLow={setLocalSqftMin} setHigh={setLocalSqftMax} />
						</div>

						{/* Strata Fee */}
						<div>
							<p className="text-sm text-[#555] mb-2">Strata / Maintenance Fee</p>
							<RangeRow
								leftLabel="Min"  leftVal={localStrataMin}
								onLeftChange={v => setLocalStrataMin(Math.max(0, Math.min(v, localStrataMax - 50)))}
								rightLabel="Max" rightVal={localStrataMax}
								onRightChange={v => setLocalStrataMax(Math.min(STRATA_MAX, Math.max(v, localStrataMin + 50)))}
								leftSuffix="$/mo" rightSuffix="$/mo"
							/>
							<DualSlider low={localStrataMin} high={localStrataMax}
								min={0} max={STRATA_MAX} step={50}
								setLow={setLocalStrataMin} setHigh={setLocalStrataMax} />
						</div>
					</section>

					<Divider />

					{/* Title Status */}
					<section>
						<SectionHead title="产权状态" />
						<div className="flex flex-wrap gap-2">
							{TITLE_OPTIONS.map(opt => (
								<button key={opt.value} type="button"
									onClick={() => setLocalTitle(opt.value)}
									className={`px-4 py-2 rounded-lg border text-sm transition
										${localTitle === opt.value ? SELECTED_CLS : DEFAULT_CLS}`}>
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
