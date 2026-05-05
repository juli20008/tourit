import { useDispatch } from "react-redux";
import { useEffect, useState } from "react";
import { useNotification } from "../../../../context/Notification";

import * as appointmentActions from "../../../../store/appointment";
import * as propertyActions from "../../../../store/property";

const LoggedIn = ({
	user,
	today,
	hour,
	property,
	username,
	setUsername,
	// phone,
	// setPhone,
	email,
	setEmail,
	message,
	setMessage,
	setShowTour,
	agentId = null,
}) => {
	const dispatch = useDispatch();
	const [errors, setErrors] = useState([]);
	const [countMsg, setCountMsg] = useState(0);
	const [submitting, setSubmitting] = useState(false);

	const { setToggleNotification, setNotificationMsg } = useNotification();

	const handleSubmit = async () => {
		setSubmitting(true);
		setErrors([]);
		try {
			const appointment = {
				property_id: property.id,
				date: today,
				time: hour,
				message,
				...(agentId ? { agent_id: agentId } : {}),
			};
			const data = await dispatch(appointmentActions.addAppointment(appointment));

			if (!data.errors) {
				// only refetch for seeded properties (integer IDs); MLS listings aren't in the DB
				if (Number.isInteger(property.id)) {
					await dispatch(propertyActions.getThisProperty(property.id));
				}
				// notify appointment booked
				setNotificationMsg(
					"Appointment booked. You can access it from Appointments"
				);
				setToggleNotification("");
				setTimeout(() => {
					setToggleNotification("notification-move");
					setNotificationMsg("");
				}, 2000);

				setShowTour(false);
			} else {
				setErrors(data.errors);
			}
		} catch {
			setErrors(["Unable to request visit right now. Please try again."]);
		} finally {
			setSubmitting(false);
		}
	};

	useEffect(() => {
		setCountMsg(255 - message.length);
	}, [message]);

	return (
		<>
			<label className="label" htmlFor="name">
				Name
				<input
					type="text"
					name="username"
					value={username}
					onChange={(e) => setUsername(e.target.value)}
					disabled={user}
					required
				/>
			</label>
			{/* <label className="label" htmlFor="phone">
				Phone
				<input
					type="text"
					name="phone"
					value={phone}
					onChange={(e) => setPhone(e.target.value)}
					disabled={user}
				/>
			</label> */}
			<label className="label" htmlFor="email">
				Email
				<input
					type="email"
					name="email"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					disabled={user}
					required
				/>
			</label>
			<label className="label" htmlFor="message">
				Message
				<textarea
					maxLength="255"
					name="message"
					value={message}
					onChange={(e) => setMessage(e.target.value)}
				/>
				<div className="input-error">
					(Optional) {countMsg} characters left (max 255)
				</div>
			</label>
			{errors && (
				<div className="error-list">
					{errors.map((err) => (
						<div key={err}>{err}</div>
					))}
				</div>
			)}
			<button type="button" className="btn" onClick={handleSubmit} disabled={submitting}>
				{submitting ? "Requesting..." : "Request visit"}
			</button>
		</>
	);
};

export default LoggedIn;
