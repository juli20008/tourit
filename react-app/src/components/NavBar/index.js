import React, { useState, useRef } from "react";
import { NavLink, useHistory, Link } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { login } from "../../store/session";
import { useNotification } from "../../context/Notification";

import AgentBar from "./Agent";
import UserBar from "./User";
import LogoBrand from "./LogoBrand";

import { Modal } from "../../context/Modal";
import Login from "./Login";

const rawApiBase = process.env.REACT_APP_API_URL || "";
const API_BASE = rawApiBase
  ? rawApiBase.replace(/^http:\/\//i, "https://").replace(/\/$/, "")
  : (typeof window !== "undefined" && window.location.hostname === "localhost" ? "" : "https://api.tourit.ca");

const NavBar = () => {
	const dispatch = useDispatch();
	const history = useHistory();
	const { setToggleNotification, setNotificationMsg } = useNotification();
	const user = useSelector((state) => state.session.user);
	const [showLogin, setShowLogin] = useState(false);
	const [showMenu, setShowMenu] = useState(false);
	const [showMobileMenu, setShowMobileMenu] = useState(false);
	const [hoverGoogle, setHoverGoogle] = useState(false);

	const dropdownRef = useRef(null);

	const openMenu = (e) => {
		e.preventDefault();
		setTimeout(() => setShowMenu(true), 1);
		document.addEventListener("click", closeMenu);
	};

	const closeMenu = (e) => {
		e.preventDefault();
		if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
			setShowMenu(false);
			document.removeEventListener("click", closeMenu);
		}
	};

	const onLogin = async (e) => {
		e.preventDefault();
		const data = await dispatch(login("demo@aa.io", "password"));
		if (!data) {
			setShowMenu(false);
			history.push("/");
		} else {
			setToggleNotification("");
			setNotificationMsg(data[0] || "Demo login failed");
			setTimeout(() => {
				setToggleNotification("notification-move");
				setNotificationMsg("");
			}, 2000);
		}
	};

	const onAgentLogin = async (e) => {
		e.preventDefault();
		const data = await dispatch(login("julie.li.realtor@gmail.com", "password"));
		if (!data) {
			setShowMenu(false);
			history.push("/appointments");
		} else {
			setToggleNotification("");
			setNotificationMsg(data[0] || "Agent demo login failed");
			setTimeout(() => {
				setToggleNotification("notification-move");
				setNotificationMsg("");
			}, 2000);
		}
	};

	const onClose = () => setShowLogin(false);

	const handleGoogleLogin = () => {
		window.location.href = `${API_BASE}/api/auth/google`;
	};

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
						<div
							className="relative"
							onMouseEnter={() => setHoverGoogle(true)}
							onMouseLeave={() => setHoverGoogle(false)}
						>
							<button
								type="button"
								className="flex items-center gap-2 rounded-lg border border-[#d1d5db] bg-white px-3 py-1.5 text-xs font-semibold text-[#1e293b] shadow-sm hover:bg-[#f9fafb] transition"
								onClick={handleGoogleLogin}
							>
								<svg width="16" height="16" viewBox="0 0 48 48">
									<path fill="#EA4335" d="M24 9.5c3.14 0 5.95 1.08 8.17 2.84l6.08-6.08C34.41 3.07 29.49 1 24 1 14.82 1 7.09 6.48 3.73 14.22l7.1 5.52C12.5 13.59 17.78 9.5 24 9.5z"/>
									<path fill="#4285F4" d="M46.14 24.5c0-1.56-.14-3.07-.4-4.5H24v8.51h12.44c-.54 2.9-2.18 5.36-4.64 7.01l7.19 5.58C43.46 37.1 46.14 31.27 46.14 24.5z"/>
									<path fill="#FBBC05" d="M10.83 28.26A14.6 14.6 0 0 1 9.5 24c0-1.49.26-2.93.73-4.26l-7.1-5.52A23.93 23.93 0 0 0 .5 24c0 3.86.92 7.51 2.63 10.72l7.7-6.46z"/>
									<path fill="#34A853" d="M24 46.5c5.49 0 10.1-1.82 13.46-4.93l-7.19-5.58c-1.89 1.27-4.3 2.01-6.27 2.01-6.22 0-11.5-4.09-13.17-9.74l-7.7 6.46C7.09 42.02 14.82 46.5 24 46.5z"/>
								</svg>
								Continue with Google
							</button>
							{hoverGoogle && (
								<div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-lg shadow-lg border border-[#e5e5e0] py-1 z-50">
									<Link
										to="/agent-login"
										className="block px-4 py-2 text-sm text-gray-500 hover:text-gray-900 hover:bg-[#f5f5f0] transition"
									>
										Agent Login &rarr;
									</Link>
								</div>
							)}
						</div>
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
								onClick={() => { setShowMobileMenu(false); handleGoogleLogin(); }}
							>
								<svg width="16" height="16" viewBox="0 0 48 48" className="mr-3 text-[#94a3b8]">
									<path fill="#EA4335" d="M24 9.5c3.14 0 5.95 1.08 8.17 2.84l6.08-6.08C34.41 3.07 29.49 1 24 1 14.82 1 7.09 6.48 3.73 14.22l7.1 5.52C12.5 13.59 17.78 9.5 24 9.5z"/>
									<path fill="#4285F4" d="M46.14 24.5c0-1.56-.14-3.07-.4-4.5H24v8.51h12.44c-.54 2.9-2.18 5.36-4.64 7.01l7.19 5.58C43.46 37.1 46.14 31.27 46.14 24.5z"/>
									<path fill="#FBBC05" d="M10.83 28.26A14.6 14.6 0 0 1 9.5 24c0-1.49.26-2.93.73-4.26l-7.1-5.52A23.93 23.93 0 0 0 .5 24c0 3.86.92 7.51 2.63 10.72l7.7-6.46z"/>
									<path fill="#34A853" d="M24 46.5c5.49 0 10.1-1.82 13.46-4.93l-7.19-5.58c-1.89 1.27-4.3 2.01-6.27 2.01-6.22 0-11.5-4.09-13.17-9.74l-7.7 6.46C7.09 42.02 14.82 46.5 24 46.5z"/>
								</svg>
								Continue with Google
							</button>
							<div className="nav-mobile-divider" />
							<button
								className="nav-mobile-item"
								onClick={() => { setShowMobileMenu(false); setShowLogin(true); }}
							>
								<i className="fa-regular fa-user mr-3 text-[#94a3b8]" />
								Login
							</button>
							<button className="nav-mobile-item" onClick={(e) => { setShowMobileMenu(false); onLogin(e); }}>
								<i className="fa-solid fa-bolt mr-3 text-[#94a3b8]" />
								User Demo Login
							</button>
							<button className="nav-mobile-item" onClick={(e) => { setShowMobileMenu(false); onAgentLogin(e); }}>
								<i className="fa-solid fa-briefcase mr-3 text-[#94a3b8]" />
								Agent Demo Login
							</button>
						</div>
					</>
				)}
			</>
		);
	}
};

export default NavBar;
