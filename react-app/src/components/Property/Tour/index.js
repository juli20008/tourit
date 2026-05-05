import { useState, useEffect, useMemo } from "react";
import { useSelector } from "react-redux";
import SelectDate from "./SelectDate";
import Contact from "./Contact";

import available from "../../Tools/Available";

const Tour = ({ property, setShowTour, inline = false, referralAgent = null }) => {
	const user = useSelector((state) => state.session.user);
	const schedule = useMemo(() => available(property), [property?.id, property?.appointments]);
	const agentLabel = referralAgent ? `Tour with ${referralAgent.username}` : "Tour with a Buyer’s Agent";
	const initialDay = Object.keys(schedule)[0] || "";

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
				<div className="tour-sidebar-header">{agentLabel}</div>
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
							referralAgentId={referralAgent?.id ?? null}
						/>
					)}
				</div>
			</form>
		);
	}

	// ── Modal variant ─────────────────────────────────────────────────────
	return (
		<form className="tour-ctrl">
			<div className="tour-top">
				<div>{agentLabel}</div>
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
						referralAgentId={referralAgent?.id ?? null}
					/>
				)}
			</div>
		</form>
	);
};

export default Tour;
