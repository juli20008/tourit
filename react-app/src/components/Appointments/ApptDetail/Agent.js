import { useState, useEffect, useMemo } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useHistory } from "react-router-dom";

import editAvailable from "../../Tools/EditAvailable";
import { useNotification } from "../../../context/Notification";

import { Modal } from "../../../context/Modal";
import Property from "../../Property";

import apiFetch from "../../../utils/apiFetch";
import * as appointmentActions from "../../../store/appointment";
import * as propertyActions from "../../../store/property";
import * as channelActions from "../../../store/channel";

const ApptDetail = ({ appt, past, onClose }) => {
	const dispatch = useDispatch();
	const history = useHistory();

	const properties = useSelector((state) => state.properties);

	const [today, setToday] = useState(appt.date);
	const [hour, setHour] = useState(appt.time);

	const [hourList, setHourList] = useState([]);
	const [errors, setErrors] = useState([]);
	const [allAgents, setAllAgents] = useState([]);
	const [selectedAgentId, setSelectedAgentId] = useState("");
	const [reassigning, setReassigning] = useState(false);
	const [assignErrors, setAssignErrors] = useState([]);
	const [showProperty, setShowProperty] = useState(false);
	const [agentsLoading, setAgentsLoading] = useState(false);

	const { setToggleNotification, setNotificationMsg } = useNotification();

	const property = properties[appt?.property_id];

	// Use Redux property if loaded; fall back to the serialized listing embedded
	// in the appointment dict (always populated by to_dict() on the backend).
	const listing = appt?.listing;
	const displayStreet = property?.street || listing?.street || "";
	const displayCity   = property?.city   || listing?.city   || "";
	const displayState  = property?.state  || listing?.state  || "";
	const displayZip    = property?.zip    || listing?.zip    || "";
	const displayImg    = property?.image_urls?.[0] || property?.front_img || listing?.image || null;

	// Memoize so schedule reference is stable between renders — prevents the
	// useEffect([schedule, today]) from firing on every render and cascading
	// into a re-render loop that fights user input.
	const schedule = useMemo(
		() => editAvailable(property, appt.date, appt.time),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[appt.date, appt.time, appt.id]
	);

	const update = async (e) => {
		e.preventDefault();
		const apptToUpdate = {
			id: appt.id,
			property_id: appt.property_id,
			date: today,
			time: hour,
			message: appt.message,
		};
		const data = await dispatch(
			appointmentActions.editAppointment(apptToUpdate)
		);
		if (!data.errors) {
			// only refetch for seeded properties (integer IDs)
			if (Number.isInteger(appt.property_id)) {
				await dispatch(propertyActions.getThisProperty(appt.property_id));
			}
			setNotificationMsg("Appointment updated");
			setToggleNotification("");
			setTimeout(() => {
				setToggleNotification("notification-move");
				setNotificationMsg("");
			}, 2000);
			onClose();
		} else {
			setTimeout(() => {
				setErrors(data.errors);
			}, 1);
		}
	};

	const undo = (e) => {
		e.preventDefault();
		setToday(appt.date);
		setHour(appt.time);
	};

	const cancel = async (e) => {
		e.preventDefault();
		const data = await dispatch(
			appointmentActions.deleteThisAppointment(appt.id)
		);
		if (!data.errors) {
			if (Number.isInteger(appt.property_id)) {
				await dispatch(propertyActions.getThisProperty(appt.property_id));
			}
			setNotificationMsg("Appointment Deleted");
			setToggleNotification("");
			setTimeout(() => {
				setToggleNotification("notification-move");
				setNotificationMsg("");
			}, 2000);
			onClose();
		} else {
			setErrors(data.errors);
		}
	};

	const chatWithClient = async (e) => {
		e.preventDefault();
		const this_channel = { user_id: appt.user_id, agent_id: appt.agent_id };
		const data = await dispatch(channelActions.addThisChannel(this_channel));
		history.push(`/chats/${data.id}`);
	};

	const loadAllAgents = async () => {
		setAgentsLoading(true);
		try {
			const response = await apiFetch("/api/agents/");
			const data = await response.json();
			if (response.ok) {
				const others = (data.agents || []).filter(
					(agent) => agent.id !== appt.agent_id
				);
				setAllAgents(others);
				setSelectedAgentId(others[0]?.id ? String(others[0].id) : "");
			} else {
				setAllAgents([]);
				setAssignErrors(data.errors || ["Unable to load agents"]);
			}
		} catch {
			setAllAgents([]);
			setAssignErrors(["Unable to load agents"]);
		} finally {
			setAgentsLoading(false);
		}
	};

	const reassignAgent = async () => {
		if (!selectedAgentId) {
			setAssignErrors(["Select an agent first"]);
			return;
		}

		setReassigning(true);
		setAssignErrors([]);
		const data = await dispatch(
			appointmentActions.assignAppointmentAgent(
				appt.id,
				Number(selectedAgentId)
			)
		);
		if (!data.errors) {
			onClose();
		} else {
			setAssignErrors(data.errors);
		}
		setReassigning(false);
	};

	// Reset date/time only when a different appointment is opened (by ID),
	// not when the appt object re-renders with the same ID — avoids resetting
	// the user's in-progress edits.
	useEffect(() => {
		setToday(appt.date);
		setHour(appt.time);
		setErrors([]);
		setAssignErrors([]);
	}, [appt.id]); // eslint-disable-line react-hooks/exhaustive-deps

	useEffect(() => {
		setHourList(schedule[today] || []);
	}, [schedule, today]);

	useEffect(() => {
		loadAllAgents();
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	return (
		<div className="appt-detail-modal">
			{displayImg ? (
				<div
					className="appt-img-detail"
					style={{ backgroundImage: `url("${displayImg}")` }}
					onClick={() => setShowProperty(true)}
				>
					<div className="appt-img-prop-detail">
						{property?.status === "Active" && (
							<div>
								<i className="fa-solid fa-circle for-sale"></i>For sale
							</div>
						)}
						{property?.status === "Pending" && (
							<div>
								<i className="fa-solid fa-circle pending"></i>Pending
							</div>
						)}
						{property?.status === "Sold" && (
							<div>
								<i className="fa-solid fa-circle sold"></i>Sold
							</div>
						)}
						{property?.price != null && (
							<div>
								$
								{property.price
									.toFixed()
									.replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1,")}
							</div>
						)}
					</div>
				</div>
			) : (
				<div className="appt-img-detail" onClick={() => setShowProperty(true)}>
					No image available
				</div>
			)}
			<div className="appt-modal-btm">
				<div
					className="appt-address-wrap"
					onClick={() => setShowProperty(true)}
				>
					<div className="appt-label">Address</div>
					<div className="appt-address">
						{displayStreet}, {displayCity}, {displayState},{" "}
						{displayZip}
					</div>
					<div className="appt-visit-property">
						Click here to visit property page
					</div>
				</div>
				<div>
					<div className="appt-label">Appointment Time</div>
					<div className="appt-time-wrap">
						<select
							className="appt-input"
							value={today}
							onChange={(e) => setToday(e.target.value)}
							disabled={past}
						>
							{Object.keys(schedule).map((day) => (
								<option value={day} key={day}>
									{day}
								</option>
							))}
						</select>
						<select
							className="appt-input"
							value={hour}
							onChange={(e) => setHour(e.target.value)}
							disabled={past}
						>
							{hourList?.map((h) => (
								<option value={h} key={h}>
									{h}
								</option>
							))}
						</select>
					</div>
				</div>
				<div className="label">
					Message
					<div>{appt.message}</div>
				</div>
				<div className="appt-agent-wrap">
					{appt.user_photo ? (
						<div
							className="appt-photo"
							style={{ backgroundImage: `url("${appt.user_photo}")` }}
						></div>
					) : (
						<div className="appt-photo">No Photo</div>
					)}

					<div className="appt-agent-details">
						<div className="name">
							<i className="fa-regular fa-user"></i> {appt.username}
						</div>
						<div>
							<i className="fa-regular fa-envelope"></i> {appt.email}
						</div>
						<button type="button" className="btn-gr" onClick={chatWithClient}>
							Chat with client <i className="fa-regular fa-comment"></i>
						</button>
					</div>
				</div>

				<div className="appt-reassign-panel">
					<div className="appt-label">Assign to another agent</div>
					<div className="appt-reassign-row">
						<select
							className="appt-input"
							value={selectedAgentId}
							onChange={(e) => setSelectedAgentId(e.target.value)}
							disabled={agentsLoading || allAgents.length === 0}
						>
							{agentsLoading ? (
								<option value="">Loading agents…</option>
							) : allAgents.length === 0 ? (
								<option value="">No other agents found</option>
							) : (
								allAgents.map((agent) => (
									<option value={String(agent.id)} key={agent.id}>
										{agent.username}{agent.office ? ` — ${agent.office}` : ""}
									</option>
								))
							)}
						</select>
						<button
							type="button"
							className="btn btn-bl"
							onClick={reassignAgent}
							disabled={agentsLoading || allAgents.length === 0 || reassigning}
						>
							{reassigning ? "Assigning..." : "Assign"}
						</button>
					</div>
					{assignErrors.length > 0 && (
						<div className="error-list error-ctr">
							{assignErrors.map((err) => (
								<div key={err}>{err}</div>
							))}
						</div>
					)}
				</div>

				{errors && (
					<div className="error-list error-ctr">
						{errors.map((err) => (
							<div key={err}>{err}</div>
						))}
					</div>
				)}
				{!past && (
					<>
						<button className="btn" type="button" onClick={update}>
							<div>Update Appointment to</div>
							<div className="btn-desc">
								{today} {hour}
							</div>
						</button>
						<div className="appt-edit-btn-wrap">
							<button type="button" className="btn btn-red" onClick={cancel}>
								Cancel Appointment
							</button>
							<button type="button" className="btn btn-bl" onClick={undo}>
								Undo Changes
							</button>
						</div>
					</>
				)}
			</div>
			{showProperty && property && (
				<Modal onClose={() => setShowProperty(false)}>
					<Property
						property={property}
						onClose={() => setShowProperty(false)}
					/>
				</Modal>
			)}
		</div>
	);
};

export default ApptDetail;
