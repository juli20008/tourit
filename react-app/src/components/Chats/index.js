import apiFetch from "../../utils/apiFetch";
import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useParams } from "react-router-dom";
import { io } from "socket.io-client";

import Channels from "./Channels";
import Chat from "./Chat";

import find_agent from "../../assets/find_agent.svg";

import * as channelActions from "../../store/channel";
import * as chatActions from "../../store/chat";
import { clearUnread, markUnread } from "../../store/unread";

const Chats = () => {
	const dispatch = useDispatch();
	const { channelId: channelParam } = useParams();
	const user = useSelector((state) => state.session.user);
	const channels = useSelector((state) => state.channels);
	const chats    = useSelector((state) => state.chats);
	const channelsRef = useRef(channels);
	const [channelsArr, setChannelsArr] = useState([]);
	const [search, setSearch] = useState("");
	const [showChannels, setShowChannels] = useState(!channelParam);

	// Hide the fixed app footer while on the chat page (it overlaps the input bar)
	useEffect(() => {
		document.body.classList.add('page-chat');
		return () => document.body.classList.remove('page-chat');
	}, []);

	// Clear unread badge whenever the user lands on the chats page
	useEffect(() => {
		dispatch(clearUnread());
	}, [dispatch]);

	// Mobile: hide channel list when a chat is opened, show it when on root /chats
	useEffect(() => {
		setShowChannels(!channelParam);
	}, [channelParam]);

	const refreshChannels = () =>
		apiFetch("/api/channels/")
			.then((res) => (res.ok ? res.json() : null))
			.then((res) => {
				if (!res?.channels) return;
				dispatch(channelActions.getChannels(res.channels));
				dispatch(chatActions.getChats(res.chats));
			})
			.catch(() => {});

	useEffect(() => {
		refreshChannels();
	}, [dispatch]); // eslint-disable-line react-hooks/exhaustive-deps

	// Keep channelsRef current so the socket closure below can read latest state
	useEffect(() => { channelsRef.current = channels; }, [channels]);

	// Agent: join personal room so guest messages arrive even before opening a channel
	useEffect(() => {
		if (!user?.agent) return;
		const sock = io(process.env.REACT_APP_API_URL || '');
		const room = `agent_${user.id}`;
		sock.on("connect", () => {
			sock.emit("join", room);
			// Re-fetch on connect to catch any bookings that arrived while connecting
			refreshChannels();
		});
		sock.on("chat", (incoming) => {
			// Strip _channel from the chat payload before storing the chat
			const { _channel: channelData, ...chatData } = incoming;
			dispatch(chatActions.addEditChat(chatData));
			// If the event carries channel info (new guest booking), add it immediately
			// so the channel list updates without waiting for refreshChannels()
			if (channelData) {
				dispatch(channelActions.addChannel(channelData));
			}
			dispatch(channelActions.addChat({ channel_id: chatData.channel_id, chat_id: chatData.id }));
			dispatch(markUnread());
			// Also refresh to catch any edge-cases (e.g. socket missed while disconnected)
			refreshChannels();
		});
		return () => { sock.emit("leave", room); sock.disconnect(); };
	}, [dispatch, user]); // eslint-disable-line react-hooks/exhaustive-deps

	const lastMsgTime = (channel) => {
		const lastId = channel?.chat_ids?.[channel.chat_ids.length - 1];
		const chat = lastId != null ? chats[lastId] : null;
		return chat?.created_at ? new Date(chat.created_at).getTime() : 0;
	};

	useEffect(() => {
		const nameKey = user.agent ? "user_name" : "agent_name";
		const arr = Object.values(channels)
			.filter((ch) => ch?.[nameKey]?.toLowerCase().includes(search.toLowerCase()))
			.sort((a, b) => lastMsgTime(b) - lastMsgTime(a));
		setChannelsArr(arr);
	}, [search, channels, chats, user]); // eslint-disable-line react-hooks/exhaustive-deps

	return (
		<div className={`chat-ctrl${showChannels ? " channels-open" : ""}`}>
			<div className="chat-channel-wrap">
				<label className="chnl-search-label">
					<input
						type="text"
						placeholder="Filter by Name"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
					/>
					<i className="fa-solid fa-magnifying-glass"></i>
				</label>
				<div className="channels">
					{channelsArr.map((channel) => (
						<Channels channel={channel} key={channel?.id} />
					))}
					{channelsArr.length === 0 && user.agent && (
						<div className="no-channels-wrap">
							<i className="fa-solid fa-magnifying-glass"></i>
							<div className="desc">
								Start by adding clients to chat through appointments
							</div>
						</div>
					)}
					{channelsArr.length === 0 && !user.agent && (
						<div className="no-channels-wrap">
							<img className="img" src={find_agent} alt="Find Agent" />
							<div className="desc">
								Start by adding agents to chat through appointments or agent
								finder
							</div>
						</div>
					)}
				</div>
			</div>
			<Chat setShowChannels={setShowChannels} />
		</div>
	);
};

export default Chats;
