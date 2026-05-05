import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { io } from "socket.io-client";

import chat from "../../../assets/chat/chat.svg";

import ChatBox from "../ChatBox";

import * as chatActions from "../../../store/chat";
import * as channelActions from "../../../store/channel";
import { markUnread } from "../../../store/unread";

let socket;

const Chat = ({ setShowChannels }) => {
	const dispatch = useDispatch();
	const user = useSelector((state) => state.session.user);
	const channelParam = useParams().channelId;
	const channels = useSelector((state) => state.channels);
	const chats = useSelector((state) => state.chats);
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");

	const channelId = parseInt(channelParam, 10) || 0;

	const focusRef = useRef();

	useEffect(() => {
		socket = io();
		socket.emit("join", channelId.toString());

		socket.on("chat", (incoming) => {
			dispatch(chatActions.addEditChat(incoming));
			dispatch(
				channelActions.addChat({
					channel_id: incoming.channel_id,
					chat_id: incoming.id,
				})
			);
			// Show unread badge if the message is from the other person
			if (incoming.user_id !== user.id) {
				dispatch(markUnread());
			}
		});

		socket.on("edit", (incoming) => {
			dispatch(chatActions.addEditChat(incoming));
		});

		socket.on("delete", (data) => {
			dispatch(chatActions.deleteChat(data.chat_id));
			dispatch(channelActions.deleteChat(data));
		});

		if (focusRef.current) {
			focusRef.current.addEventListener("DOMNodeInserted", (e) => {
				const { currentTarget: target } = e;
				target.scroll({ top: target.scrollHeight, behavior: "smooth" });
			});
		}

		return () => {
			socket.emit("leave", channelId.toString());
			socket.disconnect();
		};
	}, [channelId, dispatch, user.id]);

	if (channelParam) {
		const channel = channels[channelId];

		const sendChat = (e) => {
			e.preventDefault();
			setError("");
			if (message.length < 2001) {
				const chatToSend = {
					user_id: user.id,
					channel_id: channel.id,
					message,
					created_at: new Date(),
				};
				setTimeout(() => {
					socket.emit("chat", chatToSend);
				}, 1);
				setMessage("");
			} else if (message.length === 0) {
				setError("Please write a message");
			} else {
				setError("Message must be under 2,000 characters");
			}
		};

		const editChat = (payload) => {
			socket.emit("edit", payload);
		};

		const deleteChat = (chat_id) => {
			socket.emit("delete", chat_id);
		};

		return (
			<div className="chat-chats-wrap">
				<div className="chat-mobile-header">
					<button
						className="chat-back-btn"
						onClick={() => setShowChannels && setShowChannels(true)}
						aria-label="Back to contacts"
					>
						<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
							<polyline points="10 4 6 8 10 12" />
						</svg>
						Contacts
					</button>
					<span className="chat-mobile-name">
						{user.agent ? channel?.user_name : channel?.agent_name}
					</span>
				</div>
				<div className="chat-boxes-wrap" ref={focusRef}>
					{channel?.chat_ids?.length > 0 ? (
						channel?.chat_ids.map((id) => (
							<ChatBox
								key={id}
								chat={chats[id]}
								editChat={editChat}
								deleteChat={deleteChat}
							/>
						))
					) : (
						<div className="first-conversation">
							Be the first to start the conversation.
						</div>
					)}
				</div>
				<div className="chat-input-ctrl">
					<label className="chat-label">
						<input
							type="text"
							maxLength="2000"
							placeholder="Say something..."
							value={message}
							onChange={(e) => setMessage(e.target.value)}
							required
							onKeyPress={(e) => {
								if (e.charCode === 13) sendChat(e);
							}}
						/>
						<button type="button" onClick={sendChat}>
							Send
						</button>
						{error && <div className="chat-error">{error}</div>}
					</label>
				</div>
			</div>
		);
	} else if (chats) {
		return (
			<div className="blank-chat-div" ref={focusRef}>
				<img className="blank-chat-img" src={chat} alt="Chat" />
				<div>Click on people to start chatting</div>
			</div>
		);
	} else {
		return (
			<div className="blank-chat-div" ref={focusRef}>
				<img className="blank-chat-img" src={chat} alt="Chat" />
			</div>
		);
	}
};

export default Chat;
