import { createContext, useContext, useState, useCallback } from "react";

const ChatBubbleCtx = createContext(null);

export const ChatBubbleProvider = ({ children }) => {
	const [open, setOpen]       = useState(false);
	const [booking, setBooking] = useState(null); // { property, today, hour }

	const openWithBooking = useCallback((property, today, hour) => {
		setBooking({ property, today, hour });
		setOpen(true);
	}, []);

	return (
		<ChatBubbleCtx.Provider value={{ open, setOpen, booking, openWithBooking }}>
			{children}
		</ChatBubbleCtx.Provider>
	);
};

export const useChatBubble = () => useContext(ChatBubbleCtx);
