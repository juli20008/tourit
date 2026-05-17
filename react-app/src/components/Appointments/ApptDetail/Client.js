import { useEffect, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useHistory } from "react-router-dom";
import { useNotification } from "../../../context/Notification";

import editAvailable from "../../Tools/EditAvailable";
import Agent from "../ApptCard/Agent";

import Property from "../../Property";
import { Modal } from "../../../context/Modal";

import * as appointmentActions from "../../../store/appointment";
import * as propertyActions from "../../../store/property";

const ApptDetail = ({ appt, past, onClose }) => {
	const dispatch = useDispatch();
	const history = useHistory();

	const properties = useSelector((state) => state.properties);
	const agents = useSelector((state) => state.agents);
	const [today, setToday] = useState("");
	const [hour, setHour] = useState("");
	const [message, setMessage] = useState("");
	const [hourList, setHourList] = useState([]);
	const [errors, setErrors] = useState([]);
	const [showProperty, setShowProperty] = useState(false);
	const [maxChar, setMaxChar] = useState(255);

	const { setToggleNotification, setNotificationMsg } = useNotification();

	// appt.listing carries the embedded property snapshot (image, address, mls_number).
	// Fall back to the Redux property for legacy seeded-property appointments.
	const snap = appt?.listing;
	const property = properties[appt?.property_id];
	const agent = agents[appt?.agent_id];

	const frontImg   = snap?.image    || property?.front_img;
	const addrStreet = snap?.street   || property?.street || "";
	const addrCity   = snap?.city     || property?.city   || "";
	const addrState  = snap?.state    || (typeof property?.state === "object" ? property?.state?.state : property?.state) || "";
	const addrZip    = snap?.zip      || property?.zip    || "";
	const mlsNumber  = snap?.mls_number || appt?.mls_number;

	const handleVisitProperty = () => {
		if (mlsNumber) {
			onClose();
			history.push(`/listing/${encodeURIComponent(mlsNumber)}`);
		} else {
			setShowProperty(true);
		}
	};

	const schedule = editAvailable(property, appt.date, appt.time);

	const update = async (e) => {
		e.preventDefault();
		const apptToUpdate = {
			id: appt.id,
			property_id: appt.property_id,
			date: today,
			time: hour,
			message,
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
		setMessage(appt.message);
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

	useEffect(() => {
		setToday(appt.date);
		setHour(appt.time);
		setMessage(appt.message);
	}, [appt]);

	useEffect(() => {
		setHourList(schedule[today]);
	}, [today]);

	useEffect(() => {
		setMaxChar(255 - message.length);
	}, [message.length]);

	return (
		<div className="appt-detail-modal">
			{frontImg ? (
				<div
					className="appt-img-detail"
					style={{ backgroundImage: `url("${frontImg}")` }}
					onClick={handleVisitProperty}
				/>
			) : (
				<div className="appt-img-detail appt-img-placeholder" onClick={handleVisitProperty}>
					No image available
				</div>
			)}
			<div className="appt-modal-btm">
				<div className="appt-address-wrap">
					<div className="appt-label">Address</div>
					<div className="appt-address">
						{[addrStreet, addrCity, addrState, addrZip].filter(Boolean).join(", ")}
					</div>
					<button
						type="button"
						className="appt-visit-property"
						onClick={handleVisitProperty}
					>
						Click here to visit property page →
					</button>
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
				<label className="label">
					Message
					<textarea
						maxLength="255"
						className="appt-input"
						value={message}
						onChange={(e) => setMessage(e.target.value)}
						disabled={past}
					/>
					{!past && (
						<div className="error-list">
							(Optional) {maxChar} characters left (max 255)
						</div>
					)}
				</label>
				<Agent agent={agent} appt={appt} />
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
