import { useState, useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { io } from "socket.io-client";
import { getGuestId } from "../../../../utils/guestSession";
import { createGuestBooking, captureGuestContact, sendGuestMessage } from "../../../../store/guestBooking";

const rawApiBase = process.env.REACT_APP_API_URL || "";
const API_BASE = rawApiBase
	? rawApiBase.replace(/^http:\/\//i, "https://").replace(/\/$/, "")
	: (typeof window !== "undefined" && window.location.hostname === "localhost" ? "" : "https://api.tourit.ca");

// Phases: 0=card shown, 1=typing, 2=reply visible, 3=lead form, 4=submitted
const PHASE_TYPING   = 1;
const PHASE_REPLY    = 2;
const PHASE_FORM     = 3;
const PHASE_DONE     = 4;

const AgentAvatar = ({ photo, name }) =>
	photo
		? <img src={photo} alt={name} className="gc-agent-avatar" />
		: <div className="gc-agent-avatar gc-agent-avatar--initials">{(name || "J")[0]}</div>;

const GuestChat = ({ property, today, hour, setShowSelectDate }) => {
	const dispatch        = useDispatch();
	const whitelabelAgent = useSelector((s) => s.whitelabel?.agent);
	const agentName       = whitelabelAgent?.username || "Julie";
	const agentPhoto      = whitelabelAgent?.photo || null;

	const [phase, setPhase]           = useState(0);
	const [phone, setPhone]           = useState("");
	const [email, setEmail]           = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError]           = useState("");

	// All channel messages (both sides)
	const [chatMessages, setChatMessages]   = useState([]);
	const [guestUserId, setGuestUserId]     = useState(null);

	// Post-contact chat input
	const [inputText, setInputText]   = useState("");
	const [sending, setSending]       = useState(false);

	const bottomRef  = useRef(null);
	const socketRef  = useRef(null);
	const channelRef = useRef(null);  // persist channel_id for sending

	const guestId = getGuestId();
	const address = [property.street, property.city, property.state, property.zip]
		.filter(Boolean).join(", ");

	const apptDate = new Date(`${today}T${hour}`);
	const formattedAppt = isNaN(apptDate)
		? `${today} ${hour}`
		: `${apptDate.toDateString()} at ${apptDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

	const rawImage = Array.isArray(property.images) ? property.images[0] : (property.cover_photo || null);
	const image = typeof rawImage === "string" ? rawImage : null;

	// Fire booking immediately, get channel_id + guest_user_id, open socket
	useEffect(() => {
		let cancelled = false;
		dispatch(createGuestBooking({
			guest_id:   guestId,
			date:       today,
			time:       hour,
			address,
			image:      image || "",
			mls_number: property.mls_number || null,
		})).then((res) => {
			if (cancelled || !res?.channel_id) return;
			channelRef.current = res.channel_id;
			if (res.guest_user_id) setGuestUserId(res.guest_user_id);

			const sock = io(API_BASE, { transports: ["websocket", "polling"] });
			socketRef.current = sock;
			sock.on("connect", () => {
				sock.emit("join", String(res.channel_id));
			});
			sock.on("chat", (msg) => {
				if (msg.channel_id !== res.channel_id) return;
				setChatMessages((prev) => {
					if (prev.find((m) => m.id === msg.id)) return prev;
					return [...prev, msg];
				});
			});
		});

		const t1 = setTimeout(() => setPhase(PHASE_TYPING), 600);
		const t2 = setTimeout(() => setPhase(PHASE_REPLY),  1600);
		const t3 = setTimeout(() => setPhase(PHASE_FORM),   2300);
		return () => {
			cancelled = true;
			clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
			if (socketRef.current) { socketRef.current.disconnect(); socketRef.current = null; }
		};
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	useEffect(() => {
		bottomRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [phase, chatMessages]);

	const handleSubmit = async () => {
		if (!phone.trim() && !email.trim()) {
			setError("Please enter your phone number or email.");
			return;
		}
		setSubmitting(true);
		setError("");
		const res = await dispatch(captureGuestContact({ guest_id: guestId, phone: phone.trim(), email: email.trim() }));
		setSubmitting(false);
		if (res?.errors) {
			setError(res.errors[0] || "Something went wrong.");
		} else {
			setPhase(PHASE_DONE);
		}
	};

	const handleSendMessage = async () => {
		const text = inputText.trim();
		if (!text || sending) return;
		setInputText("");
		setSending(true);
		await dispatch(sendGuestMessage({ guest_id: guestId, text }));
		setSending(false);
	};

	return (
		<div className="gc-wrap">
			<button type="button" className="gc-back" onClick={() => setShowSelectDate(true)}>
				← Change time
			</button>

			<div className="gc-messages">
				{/* Guest-side: appointment card */}
				<div className="gc-appt-card">
					<div className="gc-appt-time">
						<i className="fa-regular fa-calendar" style={{ marginRight: 6 }} />
						{formattedAppt}
					</div>
					<div className="gc-appt-address">{address}</div>
					{image && <img src={image} alt="" className="gc-appt-img" />}
					<div className="gc-appt-badge">Showing Request Sent</div>
				</div>

				{/* Typing indicator */}
				{phase === PHASE_TYPING && (
					<div className="gc-agent-row">
						<AgentAvatar photo={agentPhoto} name={agentName} />
						<div className="gc-typing">
							<span className="gc-dot" />
							<span className="gc-dot" />
							<span className="gc-dot" />
						</div>
					</div>
				)}

				{/* Agent initial reply */}
				{phase >= PHASE_REPLY && (
					<div className="gc-agent-row gc-fadein">
						<AgentAvatar photo={agentPhoto} name={agentName} />
						<div className="gc-agent-bubble">
							Thanks for booking! {agentName} will be in touch with you shortly.
						</div>
					</div>
				)}

				{/* Real-time channel messages (both sides) */}
				{chatMessages.map((msg) => {
					const isGuest = msg.user_id === guestUserId;
					if (isGuest) {
						return (
							<div key={msg.id} className="gc-guest-row gc-fadein">
								<div className="gc-guest-bubble">{msg.message}</div>
							</div>
						);
					}
					return (
						<div key={msg.id} className="gc-agent-row gc-fadein">
							<AgentAvatar photo={agentPhoto} name={agentName} />
							<div className="gc-agent-bubble">{msg.message}</div>
						</div>
					);
				})}

				{/* Lead capture form */}
				{phase === PHASE_FORM && (
					<div className="gc-lead-card gc-fadein">
						<div className="gc-lead-title">Leave your contact info</div>
						<div className="gc-lead-sub">{agentName} will reach out to you right away.</div>

						<div className="gc-input-row">
							<i className="fa-solid fa-phone" style={{ color: "#94a3b8", fontSize: 13, flexShrink: 0 }} />
							<input
								type="tel"
								placeholder="Phone number"
								value={phone}
								onChange={(e) => setPhone(e.target.value)}
								onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
							/>
						</div>
						<div className="gc-input-row">
							<i className="fa-solid fa-envelope" style={{ color: "#94a3b8", fontSize: 13, flexShrink: 0 }} />
							<input
								type="email"
								placeholder="Email address"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
							/>
						</div>

						{error && <div className="gc-error">{error}</div>}

						<button
							type="button"
							className="gc-submit-btn"
							onClick={handleSubmit}
							disabled={submitting || (!phone.trim() && !email.trim())}
						>
							{submitting ? "Sending…" : "Send"}
						</button>

					</div>
				)}

				{/* Success state */}
				{phase === PHASE_DONE && (
					<div className="gc-success gc-fadein">
						<i className="fa-solid fa-circle-check" style={{ color: "#16a34a", fontSize: 22 }} />
						<div className="gc-success-title">We got it!</div>
						<div className="gc-success-sub">
							{agentName} will reach out to you
							{phone.trim() ? ` at ${phone.trim()}` : email.trim() ? ` at ${email.trim()}` : ""} very soon.
						</div>
					</div>
				)}

				<div ref={bottomRef} />
			</div>

			{/* Persistent chat input — appears after contact submitted */}
			{phase >= PHASE_DONE && (
				<div className="gc-chat-bar">
					<input
						type="text"
						placeholder={`Message ${agentName}…`}
						value={inputText}
						onChange={(e) => setInputText(e.target.value)}
						onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
					/>
					<button
						type="button"
						onClick={handleSendMessage}
						disabled={!inputText.trim() || sending}
						aria-label="Send"
					>
						<i className="fa-solid fa-paper-plane" style={{ fontSize: 13 }} />
					</button>
				</div>
			)}

			{/* T&C */}
			<div className="tour-tnc" style={{ marginTop: 8 }}>
				By submitting, you agree that Tourit.ca and its affiliates may contact you about your inquiry.
				Message/data rates may apply.
			</div>
		</div>
	);
};

export default GuestChat;
