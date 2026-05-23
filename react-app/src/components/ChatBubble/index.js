import { useState, useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { io } from "socket.io-client";
import { useChatBubble } from "../../context/ChatBubble";
import { getGuestId } from "../../utils/guestSession";
import { createGuestBooking, captureGuestContact, sendGuestMessage } from "../../store/guestBooking";

const rawApiBase = process.env.REACT_APP_API_URL || "";
const API_BASE = rawApiBase
	? rawApiBase.replace(/^http:\/\//i, "https://").replace(/\/$/, "")
	: (typeof window !== "undefined" && window.location.hostname === "localhost" ? "" : "https://api.tourit.ca");

const P_CARD    = 0;
const P_TYPING  = 1;
const P_REPLY   = 2;
const P_FORM    = 3;
const P_SUCCESS = 4;
const P_SKIPPED = 5;

const MsgAvatar = ({ photo, name }) =>
	photo
		? <img src={photo} alt={name} className="cb-msg-avatar" />
		: <div className="cb-msg-avatar cb-msg-avatar--initials">{(name || "J")[0]}</div>;

const GoogleIcon = () => (
	<svg width="15" height="15" viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
		<path fill="#EA4335" d="M24 9.5c3.14 0 5.95 1.08 8.17 2.84l6.08-6.08C34.41 3.07 29.49 1 24 1 14.82 1 7.09 6.48 3.73 14.22l7.1 5.52C12.5 13.59 17.78 9.5 24 9.5z"/>
		<path fill="#4285F4" d="M46.14 24.5c0-1.56-.14-3.07-.4-4.5H24v8.51h12.44c-.54 2.9-2.18 5.36-4.64 7.01l7.19 5.58C43.46 37.1 46.14 31.27 46.14 24.5z"/>
		<path fill="#FBBC05" d="M10.83 28.26A14.6 14.6 0 0 1 9.5 24c0-1.49.26-2.93.73-4.26l-7.1-5.52A23.93 23.93 0 0 0 .5 24c0 3.86.92 7.51 2.63 10.72l7.7-6.46z"/>
		<path fill="#34A853" d="M24 46.5c5.49 0 10.1-1.82 13.46-4.93l-7.19-5.58c-1.89 1.27-4.3 2.01-6.27 2.01-6.22 0-11.5-4.09-13.17-9.74l-7.7 6.46C7.09 42.02 14.82 46.5 24 46.5z"/>
	</svg>
);

const ChatBubble = () => {
	const { open, setOpen, booking } = useChatBubble();
	const user            = useSelector((s) => s.session.user);
	const whitelabelAgent = useSelector((s) => s.whitelabel?.agent);
	const dispatch        = useDispatch();

	const agentName  = whitelabelAgent?.username || "Julie";
	const agentPhoto = whitelabelAgent?.photo    || null;
	const guestId    = getGuestId();

	const [phase, setPhase]           = useState(P_CARD);
	const [phone, setPhone]           = useState("");
	const [email, setEmail]           = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError]           = useState("");
	const [hasUnreadDot, setHasUnreadDot] = useState(false);
	const [chatText, setChatText]     = useState("");
	const [chatLog, setChatLog]       = useState([]); // { from: "guest"|"agent", text }
	const [channelId, setChannelId]   = useState(null);
	const [guestUserId, setGuestUserId] = useState(null);
	const bottomRef  = useRef(null);
	const timers     = useRef([]);
	const socketRef  = useRef(null);

	useEffect(() => () => timers.current.forEach(clearTimeout), []);

	// Keep a stable ref to guestUserId so the socket handler closure doesn't stale
	const guestUserIdRef = useRef(null);
	useEffect(() => { guestUserIdRef.current = guestUserId; }, [guestUserId]);

	// Connect to socket room when we have a channel; disconnect on cleanup
	useEffect(() => {
		if (!channelId) return;

		const sock = io(API_BASE, { transports: ["websocket", "polling"] });
		socketRef.current = sock;

		sock.on("connect", () => {
			sock.emit("join", String(channelId));
		});

		sock.on("chat", (msg) => {
			// Only show messages from the agent (Julie), not our own echoes
			if (msg.user_id !== guestUserIdRef.current) {
				setChatLog((prev) => [...prev, { from: "agent", text: msg.message }]);
				setHasUnreadDot(true);
			}
		});

		return () => {
			sock.emit("leave", String(channelId));
			sock.disconnect();
			socketRef.current = null;
		};
	}, [channelId]); // eslint-disable-line react-hooks/exhaustive-deps

	const handleSendChat = async () => {
		const text = chatText.trim();
		if (!text) return;
		setChatText("");
		setChatLog((prev) => [...prev, { from: "guest", text }]);
		dispatch(sendGuestMessage({ guest_id: guestId, text }));
	};

	useEffect(() => {
		if (!booking || !open) return;
		timers.current.forEach(clearTimeout);
		setPhase(P_CARD);
		setPhone("");
		setEmail("");
		setError("");
		setChatLog([]);

		const { property, today, hour } = booking;
		const address  = [property.street, property.city, property.state, property.zip].filter(Boolean).join(", ");
		const rawImage = Array.isArray(property.images) ? property.images[0] : (property.cover_photo || null);

		dispatch(createGuestBooking({
			guest_id:   guestId,
			date:       today,
			time:       hour,
			address,
			image:      typeof rawImage === "string" ? rawImage : "",
			mls_number: property.mls_number || null,
		})).then((res) => {
			if (res?.channel_id)    setChannelId(res.channel_id);
			if (res?.guest_user_id) setGuestUserId(res.guest_user_id);
		});

		timers.current = [
			setTimeout(() => setPhase(P_TYPING), 600),
			setTimeout(() => setPhase(P_REPLY),  1600),
			setTimeout(() => setPhase(P_FORM),   2300),
		];
	}, [booking, open]); // eslint-disable-line react-hooks/exhaustive-deps

	useEffect(() => {
		if (!open && booking && phase >= P_REPLY) setHasUnreadDot(true);
		if (open) setHasUnreadDot(false);
	}, [open, phase, booking]);

	// Also clear unread dot as soon as panel opens (agent reply arrived while closed)
	useEffect(() => {
		if (open) setHasUnreadDot(false);
	}, [open]);

	useEffect(() => {
		bottomRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [phase, chatLog]);

	const handleSubmit = async () => {
		if (!phone.trim() && !email.trim()) { setError("Please enter your phone or email."); return; }
		setSubmitting(true);
		setError("");
		const res = await dispatch(captureGuestContact({ guest_id: guestId, phone: phone.trim(), email: email.trim() }));
		setSubmitting(false);
		if (res?.errors) setError(res.errors[0] || "Something went wrong.");
		else setPhase(P_SUCCESS);
	};

	const handleGoogleLogin = () => {
		if (booking) {
			sessionStorage.setItem("tourReturn", JSON.stringify({
				propertyId: booking.property.id,
				date:       booking.today,
				hour:       booking.hour,
				stage:      "contact",
				path:       `${window.location.pathname}${window.location.search}`,
			}));
		}
		window.location.href = `${API_BASE}/api/auth/google?return_to=${encodeURIComponent(window.location.href)}`;
	};

	if (user) return null;

	// ── Closed button ──────────────────────────────────────────────────────
	if (!open) {
		return (
			<button className="cb-btn" onClick={() => setOpen(true)} aria-label="Chat with us">
				<i className="fa-regular fa-comment-dots" />
				{hasUnreadDot && <span className="cb-badge" />}
			</button>
		);
	}

	// ── Derive display values ──────────────────────────────────────────────
	const { property, today, hour } = booking || {};
	const address = booking
		? [property.street, property.city, property.state, property.zip].filter(Boolean).join(", ")
		: "";
	const apptDate = booking ? new Date(`${today}T${hour}`) : null;
	const formattedAppt = apptDate && !isNaN(apptDate)
		? `${apptDate.toDateString()} at ${apptDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
		: booking ? `${today} ${hour}` : "";
	const rawImage = booking && Array.isArray(property.images) ? property.images[0] : (booking?.property?.cover_photo || null);
	const image = typeof rawImage === "string" ? rawImage : null;
	const contactStr = phone.trim() || email.trim();

	// ── Open panel ─────────────────────────────────────────────────────────
	return (
		<div className="cb-panel">
			{/* Header */}
			<div className="cb-header">
				{agentPhoto
					? <img src={agentPhoto} alt={agentName} className="cb-agent-avatar" />
					: <div className="cb-agent-avatar cb-agent-avatar--initials">{agentName[0]}</div>
				}
				<div className="cb-agent-info">
					<div className="cb-agent-name">{agentName}</div>
					<div className="cb-agent-status">Online</div>
				</div>
				<button className="cb-close-btn" onClick={() => setOpen(false)} aria-label="Close chat">
					<i className="fa-solid fa-xmark" />
				</button>
			</div>

			{/* Messages */}
			<div className="cb-messages">

				{/* No booking yet — generic greeting */}
				{!booking && (
					<>
						<div className="cb-agent-row cb-fadein">
							<MsgAvatar photo={agentPhoto} name={agentName} />
							<div className="cb-agent-bubble">
								Hi! I'm {agentName}. Select a date and time above to request a showing — I'll confirm right away.
							</div>
						</div>
						<div style={{ marginTop: "auto", paddingTop: 12 }}>
							<div className="cb-google-hint">⚡ 1-click to sync your tour to Google Calendar</div>
							<button type="button" className="cb-google-btn" style={{ marginTop: 6 }} onClick={handleGoogleLogin}>
								<GoogleIcon /> Continue with Google
							</button>
						</div>
					</>
				)}

				{/* Booking flow */}
				{booking && (
					<>
						{/* Appointment card — right-aligned (guest sent) */}
						<div className="cb-appt-card">
							<div className="cb-appt-time">
								<i className="fa-regular fa-calendar" style={{ marginRight: 5 }} />
								{formattedAppt}
							</div>
							<div className="cb-appt-address">{address}</div>
							{image && <img src={image} alt="" className="cb-appt-img" />}
							<div className="cb-appt-badge">Showing Request Sent</div>
						</div>

						{/* Typing dots */}
						{phase === P_TYPING && (
							<div className="cb-agent-row">
								<MsgAvatar photo={agentPhoto} name={agentName} />
								<div className="cb-typing">
									<span className="cb-dot" /><span className="cb-dot" /><span className="cb-dot" />
								</div>
							</div>
						)}

						{/* Agent reply */}
						{phase >= P_REPLY && (
							<div className="cb-agent-row cb-fadein">
								<MsgAvatar photo={agentPhoto} name={agentName} />
								<div className="cb-agent-bubble">
									Thanks for booking! {agentName} will be in touch with you shortly.
								</div>
							</div>
						)}

						{/* Lead capture form — stays in chat history even after skip */}
						{phase >= P_FORM && phase !== P_SUCCESS && (
							<div className="cb-lead-prompt cb-fadein">
								<div className="cb-lead-title">📅 Lock in your showing?</div>
								<div className="cb-lead-sub">
									Where should we send your booking confirmation and entry instructions?
								</div>

								<div className={`cb-input-row${email.trim() && !phone.trim() ? " cb-input-row--dim" : ""}`}>
									<i className="fa-solid fa-phone" style={{ color: "#94a3b8", fontSize: 12, flexShrink: 0 }} />
									<input
										type="tel"
										placeholder="Phone number"
										value={phone}
										onChange={(e) => setPhone(e.target.value)}
										onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
									/>
								</div>
								<div className={`cb-input-row${phone.trim() && !email.trim() ? " cb-input-row--dim" : ""}`}>
									<i className="fa-solid fa-envelope" style={{ color: "#94a3b8", fontSize: 12, flexShrink: 0 }} />
									<input
										type="email"
										placeholder="Email address"
										value={email}
										onChange={(e) => setEmail(e.target.value)}
										onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
									/>
								</div>

								{error && <div className="cb-error">{error}</div>}

								<div className="cb-lead-actions">
									<button
										type="button"
										className="cb-submit-btn"
										onClick={handleSubmit}
										disabled={submitting || (!phone.trim() && !email.trim())}
									>
										{submitting ? "Confirming…" : "Secure My Slot"}
									</button>
									{/* Skip only shows the first time — disappears once skipped */}
									{phase === P_FORM && (
										<button type="button" className="cb-skip-btn" onClick={() => setPhase(P_SKIPPED)}>
											I'll skip for now
										</button>
									)}
								</div>

								<div className="cb-google-hint">⚡ 1-click to sync this tour to your Google Calendar</div>
								<button type="button" className="cb-google-btn" onClick={handleGoogleLogin}>
									<GoogleIcon /> Continue with Google
								</button>
							</div>
						)}

						{/* Warm follow-up after skip — form stays above, this appears below */}
						{phase === P_SKIPPED && (
							<div className="cb-agent-row cb-fadein">
								<MsgAvatar photo={agentPhoto} name={agentName} />
								<div className="cb-agent-bubble">
									No problem! You can still lock in this time later. I'm reviewing your request now.
								</div>
							</div>
						)}

						{/* Success */}
						{phase === P_SUCCESS && (
							<div className="cb-success cb-fadein">
								<i className="fa-solid fa-circle-check" style={{ color: "#16a34a", fontSize: 20 }} />
								<div className="cb-success-title">You're confirmed!</div>
								<div className="cb-success-sub">
									Your booking confirmation{contactStr ? ` will be sent to ${contactStr}` : " is locked in"}.{" "}
									{agentName} will follow up shortly.
								</div>
								<div className="cb-google-hint" style={{ marginTop: 4 }}>⚡ Sync this tour to your Google Calendar</div>
								<button type="button" className="cb-google-btn" style={{ marginTop: 4 }} onClick={handleGoogleLogin}>
									<GoogleIcon /> Continue with Google
								</button>
							</div>
						)}

					{/* Live chat log: guest messages + Julie replies interleaved */}
					{chatLog.map((entry, i) =>
						entry.from === "guest"
							? <div key={i} className="cb-guest-bubble cb-fadein">{entry.text}</div>
							: (
								<div key={i} className="cb-agent-row cb-fadein">
									<MsgAvatar photo={agentPhoto} name={agentName} />
									<div className="cb-agent-bubble">{entry.text}</div>
								</div>
							)
					)}
				</>
			)}

			<div ref={bottomRef} />
		</div>

		{/* Footer — always-open chat input */}
		<div className="cb-footer">
			<div className="cb-footer-input-row">
				<input
					type="text"
					className="cb-footer-input"
					placeholder={`Message ${agentName}…`}
					value={chatText}
					onChange={(e) => setChatText(e.target.value)}
					onKeyDown={(e) => e.key === "Enter" && handleSendChat()}
				/>
				<button
					type="button"
					className="cb-footer-send"
					onClick={handleSendChat}
					disabled={!chatText.trim()}
					aria-label="Send"
				>
					<i className="fa-solid fa-paper-plane" />
				</button>
			</div>
		</div>
	</div>
	);
};

export default ChatBubble;
