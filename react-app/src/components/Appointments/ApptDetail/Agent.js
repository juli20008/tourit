import { useState, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useHistory } from "react-router-dom";

import editAvailable from "../../Tools/EditAvailable";
import { useNotification } from "../../../context/Notification";

import { Modal } from "../../../context/Modal";
import Property from "../../Property";

import * as appointmentActions from "../../../store/appointment";
import * as propertyActions from "../../../store/property";
import * as channelActions from "../../../store/channel";

const ApptDetail = ({ appt, past, onClose }) => {
	const dispatch = useDispatch();
	const history = useHistory();

	const properties = useSelector((state) => state.properties);

	const [today, setToday] = useState("");
	const [hour, setHour] = useState("");

	const [hourList, setHourList] = useState([]);
	const [errors, setErrors] = useState([]);
	const [availableAgents, setAvailableAgents] = useState([]);
	const [selectedAgentId, setSelectedAgentId] = useState("");
	const [reassigning, setReassigning] = useState(false);
	const [assignErrors, setAssignErrors] = useState([]);
	const [showProperty, setShowProperty] = useState(false);

	const { setToggleNotification, setNotificationMsg } = useNotification();

	const property = properties[appt?.property_id];

	const schedule = editAvailable(property, appt.date, appt.time);

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
			// after appt updated, need to dispatch to update property
			await dispatch(propertyActions.getThisProperty(appt.property_id));
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
			// after appt updated, need to dispatch to update property
			await dispatch(propertyActions.getThisProperty(appt.property_id));
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
		// send a post request to channels. will create channel if does not exist
		const data = await dispatch(channelActions.addThisChannel(this_channel));
		// use history to redirect
		history.push(`/chats/${data.id}`);
	};

	const loadAvailableAgents = async () => {
		try {
			const response = await fetch(
				`/api/appointments/available-agents?date=${appt.date}&time=${appt.time}&property_id=${appt.property_id}`
			);
			const data = await response.json();
			if (response.ok) {
				const others = (data.agents || []).filter(
					(agent) => agent.id !== appt.agent_id
				);
				setAvailableAgents(others);
				setSelectedAgentId(others[0]?.id ? String(others[0].id) : "");
			} else {
				setAvailableAgents([]);
				setAssignErrors(data.errors || ["Unable to load available agents"]);
			}
		} catch (error) {
			setAvailableAgents([]);
			setAssignErrors(["Unable to load available agents"]);
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

	useEffect(() => {
		setToday(appt.date);
		setHour(appt.time);
		setAssignErrors([]);
	}, [appt]);

	useEffect(() => {
		setHourList(schedule[today]);
	}, [schedule, today]);

	useEffect(() => {
		if (appt?.id) {
			loadAvailableAgents();
		}
	}, [appt?.id, appt?.date, appt?.time, appt?.property_id]);

	return (
		<div className="appt-detail-modal">
			{property?.front_img ? (
				<div
					className="appt-img-detail"
					style={{ backgroundImage: `url("${property.front_img}")` }}
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
						<div>
							$
							{property?.price
								.toFixed()
								.replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1,")}
						</div>
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
						{property?.street}, {property?.city}, {property?.state},{" "}
						{property?.zip}
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
							{hourList?.map((hour) => (
								<option value={hour} key={hour}>
									{hour}
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
							disabled={availableAgents.length === 0}
						>
							{availableAgents.length === 0 ? (
								<option value="">No other agents available</option>
							) : (
								availableAgents.map((agent) => (
									<option value={agent.id} key={agent.id}>
										{agent.username} - {agent.office}
									</option>
								))
							)}
						</select>
						<button
							type="button"
							className="btn btn-bl"
							onClick={reassignAgent}
							disabled={availableAgents.length === 0 || reassigning}
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
			{showProperty && (
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
