import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { io } from "socket.io-client";
import { markUnread } from "../../store/unread";
import apiFetch from "../../utils/apiFetch";

/**
 * Maintains a background socket connection to all of the user's channel rooms
 * so the unread-dot in the NavBar fires even when the user isn't on /chats.
 *
 * When the user IS on /chats, this component disconnects completely so it
 * doesn't conflict with the per-channel socket inside Chat.js (duplicate
 * events would cause messages to appear twice in Redux).
 */
const UnreadNotifier = () => {
	const user     = useSelector((state) => state.session.user);
	const dispatch = useDispatch();
	const location = useLocation();

	const isOnChats   = location.pathname.startsWith("/chats");
	const onChatsRef  = useRef(isOnChats);
	useEffect(() => { onChatsRef.current = isOnChats; }, [isOnChats]);

	useEffect(() => {
		if (!user || isOnChats) return;

		let socket = null;
		let rooms  = [];
		let alive  = true;

		apiFetch("/api/channels/")
			.then((r) => r.json())
			.then(({ channels }) => {
				// Bail if the user navigated to /chats while the fetch was in flight
				if (!alive || onChatsRef.current || !channels?.length) return;

				socket = io(process.env.REACT_APP_API_URL || "");
				rooms  = channels.map((c) => c.id.toString());
				rooms.forEach((id) => socket.emit("join", id));

				socket.on("chat", (incoming) => {
					if (incoming.user_id !== user.id && !onChatsRef.current) {
						dispatch(markUnread());
					}
				});
			})
			.catch(() => {});

		return () => {
			alive = false;
			if (socket) {
				rooms.forEach((id) => socket.emit("leave", id));
				socket.disconnect();
				socket = null;
			}
		};
	}, [user?.id, isOnChats, dispatch]); // eslint-disable-line react-hooks/exhaustive-deps

	return null;
};

export default UnreadNotifier;
