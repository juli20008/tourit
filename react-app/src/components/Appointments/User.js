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
	const [activeTab, setActiveTab] = useState("upcoming"); // "upcoming" | "past"
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
		if (upcomingRef.current) upcomingRef.current.classList.toggle("appt-active", activeTab === "upcoming");
		if (pastRef.current) pastRef.current.classList.toggle("appt-active", activeTab === "past");
	}, [activeTab]);

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
						onClick={() => setActiveTab("upcoming")}
					>
						Upcoming Appointments
					</div>
					<div
						className="app-btn"
						ref={pastRef}
						onClick={() => setActiveTab("past")}
					>
						Past Appointments
					</div>
				</div>
				<div className="appt-card-list">
					{activeTab === "upcoming" && <Upcoming newAppt={newAppt} />}
					{activeTab === "past" && (
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
