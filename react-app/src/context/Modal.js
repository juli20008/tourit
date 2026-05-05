import React, { useContext, useRef, useState, useEffect } from "react";
import ReactDOM from "react-dom";

const ModalContext = React.createContext();

export function ModalProvider({ children }) {
	const modalRef = useRef();
	const [value, setValue] = useState();

	useEffect(() => {
		setValue(modalRef.current);
	}, []);

	return (
		<>
			<ModalContext.Provider value={value}>{children}</ModalContext.Provider>
			<div ref={modalRef} />
		</>
	);
}

export function Modal({ onClose, children }) {
	const modalNode = useContext(ModalContext);
	if (!modalNode) return null;

	return ReactDOM.createPortal(
		<div className="modal">
			{/* stopPropagation on both divs prevents clicks inside the portal
			    from bubbling through the React tree to a parent card's onClick,
			    which would immediately re-open the modal (zombie bug). */}
			<div className="modal-background" onClick={(e) => { e.stopPropagation(); onClose(); }} />
			<div className="modal-content" onClick={(e) => e.stopPropagation()}>
				{children}
				<div className="modal-credit">
					Tourit &mdash; Home Tours Simplified.<br />&copy; 2026 Tourit. All rights reserved. &middot; Julie Li, Bay Street Group &middot; 905-909-0101
				</div>
			</div>
		</div>,
		modalNode
	);
}
