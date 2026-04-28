import React, { useState } from "react";
import { NavLink } from "react-router-dom";
import { useSelector } from "react-redux";

import AgentBar from "./Agent";
import UserBar from "./User";
import LogoBrand from "./LogoBrand";

import { Modal } from "../../context/Modal";
import Login from "./Login";

const NavBar = () => {
	const user = useSelector((state) => state.session.user);
	const [showLogin, setShowLogin] = useState(false);
	const [showMobileMenu, setShowMobileMenu] = useState(false);

	const onClose = () => setShowLogin(false);

	if (user && user.agent) {
		return <AgentBar />;
	} else if (user) {
		return <UserBar />;
	} else {
		return (
			<>
				<nav className="nav">
					<div className="nav-lf">
						{/* Desktop */}
						<NavLink to="/agents" className="btn-font-lt nav-desktop-only">
							Agent Finder
						</NavLink>
						{/* Mobile hamburger */}
						<button
							className="nav-hamburger"
							onClick={() => setShowMobileMenu((v) => !v)}
							aria-label="Menu"
						>
							{showMobileMenu ? (
								<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round">
									<line x1="3" y1="3" x2="15" y2="15" />
									<line x1="15" y1="3" x2="3" y2="15" />
								</svg>
							) : (
								<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round">
									<line x1="2" y1="5" x2="16" y2="5" />
									<line x1="2" y1="9" x2="16" y2="9" />
									<line x1="2" y1="13" x2="16" y2="13" />
								</svg>
							)}
						</button>
					</div>
					<NavLink to="/" exact={true} onClick={() => setShowMobileMenu(false)}>
						<LogoBrand />
					</NavLink>
					<div className="nav-rt nav-desktop-only">
						<button className="btn-font-lt" onClick={() => setShowLogin(true)}>
							Login
						</button>
					</div>
					{showLogin && (
						<Modal onClose={onClose}>
							<Login onClose={onClose} />
						</Modal>
					)}
				</nav>
				{showMobileMenu && (
					<>
						<div
							className="nav-mobile-backdrop"
							onClick={() => setShowMobileMenu(false)}
						/>
						<div className="nav-mobile-menu">
							<NavLink
								to="/agents"
								className="nav-mobile-item"
								onClick={() => setShowMobileMenu(false)}
							>
								<i className="fa-solid fa-magnifying-glass mr-3 text-[#94a3b8]" />
								Agent Finder
							</NavLink>
							<div className="nav-mobile-divider" />
							<button
								className="nav-mobile-item"
								onClick={() => { setShowMobileMenu(false); setShowLogin(true); }}
							>
								<i className="fa-regular fa-user mr-3 text-[#94a3b8]" />
								Login
							</button>
						</div>
					</>
				)}
			</>
		);
	}
};

export default NavBar;
