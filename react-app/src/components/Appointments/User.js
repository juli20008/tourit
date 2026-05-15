import { useRef, useState, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";

import SplitAppt from "../Tools/SplitAppt";

import Upcoming from "./Upcoming";
import Past from "./Past";

import Basic from "./Calendar";
import Availability from "./Availability";
import * as appointmentActions from "../../store/appointment";

const User = () => {
	const dispatch = useDispatch();
	const appointments = useSelector((state) => state.appointments);
	const user = useSelector((state) => state.session.user);
	const [showUpcoming, setShowUpcoming] = useState(true);
	const [newAppt, setNewAppt] = useState([]);
	const [pastAppt, setPastAppt] = useState([]);
	const [archiving, setArchiving] = useState(false);

	const handleArchivePast = async () => {
		setArchiving(true);
		await dispatch(appointmentActions.archivePastAppointments());
		setArchiving(false);
	};

	const upcomingRef = useRef();
	const pastRef = useRef();

	useEffect(() => {
		if (showUpcoming) {
			upcomingRef.current.classList.add("appt-active");
			pastRef.current.classList.remove("appt-active");
		} else {
			upcomingRef.current.classList.remove("appt-active");
			pastRef.current.classList.add("appt-active");
		}
	}, [showUpcoming]);

	useEffect(() => {
		if (appointments) {
			setNewAppt(SplitAppt(appointments)[0]);
			setPastAppt(SplitAppt(appointments)[1]);
		}
	}, [appointments]);

	return (
		<div className="appointment-ctrl">
			<Basic />
			<div>
				{user?.agent && <Availability />}
				<div className="appt-wrap">
					<div
						className="app-btn"
						ref={upcomingRef}
						onClick={() => setShowUpcoming(true)}
					>
						Upcoming Appointments
					</div>
					<div
						className="app-btn"
						ref={pastRef}
						onClick={() => setShowUpcoming(false)}
					>
						Past Appointments
					</div>
				</div>
				<div className="appt-card-list">
					{showUpcoming && <Upcoming newAppt={newAppt} />}
					{!showUpcoming && (
						<>
							{user?.agent && pastAppt.length > 0 && (
								<div style={{ textAlign: "right", marginBottom: "10px" }}>
									<button
										className="btn btn-sm"
										onClick={handleArchivePast}
										disabled={archiving}
									>
										{archiving ? "Archiving…" : "Archive All Past"}
									</button>
								</div>
							)}
							<Past pastAppt={pastAppt} />
						</>
					)}
				</div>
			</div>
		</div>
	);
};
export default User;
