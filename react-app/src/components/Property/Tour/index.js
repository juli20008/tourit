import { useState, useEffect, useMemo } from "react";
import { useSelector, useDispatch } from "react-redux";

import SelectDate from "./SelectDate";
import Contact from "./Contact";
import LiveTourSection from "./LiveTourSection";

import available from "../../Tools/Available";
import { fetchLiveTours } from "../../../store/liveTours";

const Tour = ({ property, setShowTour, inline = false, referralAgent = null }) => {
	const dispatch = useDispatch();
	const user = useSelector((state) => state.session.user);
	const whitelabelAgent = useSelector((state) => state.whitelabel?.agent);
	const effectiveAgent = referralAgent || whitelabelAgent || null;
	const isWhitelabel = !referralAgent && !!whitelabelAgent;
	const schedule = useMemo(() => available(property), [property?.id, property?.appointments]);
	const agentLabel = effectiveAgent ? `Tour with ${effectiveAgent.username}` : "Tour with a Buyer’s Agent";
	const initialDay = Object.keys(schedule)[0] || "";

	const mlsNumber = property?.mls_number || (typeof property?.id === "string" && property.id.startsWith("mls_") ? property.id.slice(4) : null);
	const liveTours = useSelector(s => mlsNumber ? (s.liveTours[mlsNumber] || []) : []);

	useEffect(() => {
		if (mlsNumber) dispatch(fetchLiveTours(mlsNumber));
	}, [mlsNumber, dispatch]);

	const [today, setToday] = useState(initialDay);
	const [hour, setHour] = useState();
	const [showSelectDate, setShowSelectDate] = useState(true);
	const [hourList, setHourList] = useState([]);

	useEffect(() => {
		const initialHours = schedule[today] || [];
		setHourList(initialHours);
		setHour(initialHours[0] || "");
	}, [schedule, today]);

	useEffect(() => {
		const raw = sessionStorage.getItem("tourReturn");
		if (!raw) return;

		try {
			const saved = JSON.parse(raw);
			if (String(saved?.propertyId) !== String(property?.id)) return;

			if (saved.date) {
				setToday(saved.date);
				if (Array.isArray(schedule[saved.date])) {
					setHourList(schedule[saved.date]);
					setHour(saved.hour || schedule[saved.date][0]);
				} else if (saved.hour) {
					setHour(saved.hour);
				}
			}

			if (saved.stage === "contact") {
				setShowSelectDate(false);
			}

			if (user) {
				sessionStorage.removeItem("tourReturn");
			}
		} catch {
			sessionStorage.removeItem("tourReturn");
		}
	}, [property?.id, schedule, user]);

	useEffect(() => {
		if (!Array.isArray(schedule[today])) return;
		setHourList(schedule[today]);
		if (!hour || !schedule[today].includes(hour)) {
			setHour(schedule[today][0]);
		}
	}, [schedule, today]);

	// ── Inline variant (sticky sidebar inside the listing modal) ──────────
	if (inline) {
		return (
			<form className="tour-sidebar">
				<div className="tour-sidebar-header" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
					{agentLabel}
					{effectiveAgent?.photo && (
						<img src={effectiveAgent.photo} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
					)}
				</div>
				<div className="tour-sidebar-body">
					{showSelectDate ? (
						<SelectDate
							property={property}
							available={schedule}
							hourList={hourList}
							setHourList={setHourList}
							hour={hour}
							setHour={setHour}
							today={today}
							setToday={setToday}
							setShowSelectDate={setShowSelectDate}
						/>
					) : (
						<Contact
							property={property}
							today={today}
							setShowSelectDate={setShowSelectDate}
							hour={hour}
							setShowTour={setShowTour}
							referralAgentId={effectiveAgent?.id ?? null}
							whitelabel={isWhitelabel}
						/>
					)}
					{mlsNumber && <LiveTourSection mlsNumber={mlsNumber} tours={liveTours} />}
				</div>
			</form>
		);
	}

	// ── Modal variant ─────────────────────────────────────────────────────
	return (
		<form className="tour-ctrl">
			<div className="tour-top">
				<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
					{agentLabel}
					{effectiveAgent?.photo && (
						<img src={effectiveAgent.photo} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
					)}
				</div>
				<i className="fa-solid fa-xmark" onClick={() => setShowTour(false)}></i>
			</div>
			<div className="tour-btm">
				{showSelectDate ? (
					<SelectDate
						property={property}
						available={schedule}
						hourList={hourList}
						setHourList={setHourList}
						hour={hour}
						setHour={setHour}
						today={today}
						setToday={setToday}
						setShowSelectDate={setShowSelectDate}
					/>
				) : (
					<Contact
						property={property}
						today={today}
						setShowSelectDate={setShowSelectDate}
						hour={hour}
						setShowTour={setShowTour}
						referralAgentId={effectiveAgent?.id ?? null}
						whitelabel={isWhitelabel}
					/>
				)}
				{mlsNumber && <LiveTourSection mlsNumber={mlsNumber} tours={liveTours} />}
			</div>
		</form>
	);
};

export default Tour;
