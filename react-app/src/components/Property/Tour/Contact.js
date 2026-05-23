import { useState, useEffect } from "react";
import { useSelector } from "react-redux";

import LoggedIn from "./ContactForms/LoggedIn";
import GuestChat from "./GuestChat";

const Contact = ({ property, today, hour, setShowSelectDate, setShowTour, referralAgentId = null, whitelabel = false }) => {
	const user = useSelector((state) => state.session.user);

	const [username, setUsername] = useState("");
	const [phone, setPhone] = useState("");
	const [email, setEmail] = useState("");
	const [message, setMessage] = useState(
		`I am interested in ${property.street}, ${property.city}, ${property.state} ${property.zip}.`
	);
	const [isAgent, setIsAgent] = useState(false);

	const appointment = new Date(`${today} ${hour}`);

	useEffect(() => {
		if (user) {
			setUsername(user.username);
			if (user.phone) setPhone(user.phone);
			setEmail(user.email);
			if (user.agent) setIsAgent(true);
		}
	}, [user]);

	if (!user) {
		return (
			<GuestChat
				property={property}
				today={today}
				hour={hour}
				setShowSelectDate={setShowSelectDate}
			/>
		);
	}

	return (
		<>
			{!isAgent && (
				<div className="tour-appt-time">
					{appointment.toDateString()} at {appointment.toLocaleTimeString()}
					<button className="btn-font" onClick={() => setShowSelectDate(true)}>
						Edit
					</button>
				</div>
			)}
			{isAgent && (
				<div className="tour-agent-msg">
					Please edit your appointment with clients through "Appointments" in
					the navigation bar.
				</div>
			)}
			{!isAgent && (
				<LoggedIn
					user={user}
					property={property}
					username={username}
					setUsername={setUsername}
					phone={phone}
					setPhone={setPhone}
					email={email}
					setEmail={setEmail}
					message={message}
					setMessage={setMessage}
					today={today}
					hour={hour}
					setShowTour={setShowTour}
					agentId={referralAgentId}
					whitelabel={whitelabel}
				/>
			)}
			{!isAgent && (
				<div className="tour-tnc">
					By pressing Request visit, you are contacting a buyer's agent, you
					agree that Tourit.ca and its affiliates, and real estate
					professionals may call/text you about your inquiry, which may involve
					use of automated means and prerecorded/artificial voices. You don't
					need to consent as a condition of buying any property, goods or
					services. Message/data rates may apply. You also agree to our Terms of
					Use. Tourit.ca does not endorse any real estate professionals. We may
					share information about your recent and future site activity with your
					agent to help them understand what you're looking for in a home.
				</div>
			)}
		</>
	);
};

export default Contact;
