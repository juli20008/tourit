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

	useEffect(() => {
		apiFetch("/api/channels/")
			.then((res) => res.json())
			.then((res) => {
				dispatch(channelActions.getChannels(res.channels));
				dispatch(chatActions.getChats(res.chats));
			});
	}, [dispatch]);

	// Keep channelsRef current so the socket closure below can read latest state
	useEffect(() => { channelsRef.current = channels; }, [channels]);

	// Agent: join personal room so guest messages arrive even before opening a channel
	useEffect(() => {
		if (!user?.agent) return;
		const sock = io(process.env.REACT_APP_API_URL || '');
		const room = `agent_${user.id}`;
		sock.on("connect", () => sock.emit("join", room));
		sock.on("chat", (incoming) => {
			dispatch(chatActions.addEditChat(incoming));
			dispatch(channelActions.addChat({ channel_id: incoming.channel_id, chat_id: incoming.id }));
			dispatch(markUnread());
			// Channel not loaded yet → re-fetch the full list to get the new channel
			if (!channelsRef.current?.[incoming.channel_id]) {
				apiFetch("/api/channels/")
					.then(r => r.json())
					.then(r => {
						dispatch(channelActions.getChannels(r.channels));
						dispatch(chatActions.getChats(r.chats));
					});
			}
		});
		return () => { sock.emit("leave", room); sock.disconnect(); };
	}, [dispatch, user]);

	useEffect(() => {
		if (user.agent) {
			const arr = Object.values(channels).filter((channel) =>
				channel?.user_name.includes(search)
			);
			setChannelsArr(arr);
		} else {
			const arr = Object.values(channels).filter((channel) =>
				channel?.agent_name.toLowerCase().includes(search.toLowerCase())
			);
			setChannelsArr(arr);
		}
	}, [search, channels, user]);

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
