import React, { useState, useRef, useEffect } from "react";
import { NavLink } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { logout } from "../../../store/session";
import LogoBrand from "../LogoBrand";
import LangToggle from "../LangToggle";

const AgentBar = () => {
	const dispatch = useDispatch();
	const hasUnread       = useSelector(s => s.hasUnread);
	const whitelabelAgent = useSelector(s => s.whitelabel?.agent);
	const user            = useSelector(s => s.session.user);
	const brandAgent      = whitelabelAgent || (user?.agent ? user : null);
	const [showMobileMenu, setShowMobileMenu] = useState(false);
	const [showVideoMenu, setShowVideoMenu]   = useState(false);
	const [showMobileVideo, setShowMobileVideo] = useState(false);
	const videoMenuRef = useRef(null);

	useEffect(() => {
		if (!showVideoMenu) return;
		const handler = (e) => {
			if (videoMenuRef.current && !videoMenuRef.current.contains(e.target)) {
				setShowVideoMenu(false);
			}
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [showVideoMenu]);

	const onLogout = async () => {
		setShowMobileMenu(false);
		await dispatch(logout());
	};

	return (
		<>
			<nav className="nav nav-agent">
				<div className="nav-lf">
					<NavLink to="/agents" className="btn-font-lt nav-desktop-only">
						Agent Finder
					</NavLink>
					<NavLink to="/reviews" exact={true} className="btn-font-lt nav-desktop-only">
						My Reviews
					</NavLink>
					<button
						type="button"
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
					<LogoBrand agentName={brandAgent?.username || null} agentPhoto={brandAgent?.photo || null} />
				</NavLink>
				<div className="nav-rt">
					<NavLink to="/chats" exact={true} className="btn-font-lt nav-desktop-only nav-chat-link">
						<i className="fa-regular fa-comment"></i> Chats
						{hasUnread && <span className="nav-badge-dot" />}
					</NavLink>
					<NavLink to="/appointments" exact={true} className="btn-font-lt nav-desktop-only">
						Appointments
					</NavLink>

					{/* 视频 dropdown */}
					<div className="nav-video-wrap nav-desktop-only" ref={videoMenuRef}>
						<button
							className="btn-font-lt nav-video-btn"
							onClick={() => setShowVideoMenu((v) => !v)}
						>
							视频
							<i className={`fa-solid fa-chevron-${showVideoMenu ? "up" : "down"} nav-video-chevron`} />
						</button>
						{showVideoMenu && (
							<div className="nav-video-dropdown">
								<NavLink
									to="/make-video"
									className="nav-video-item"
									onClick={() => setShowVideoMenu(false)}
								>
									<i className="fa-solid fa-camera-house nav-video-item-icon" />
									看房视频
								</NavLink>
								<NavLink
									to="/ppt-video"
									className="nav-video-item"
									onClick={() => setShowVideoMenu(false)}
								>
									<i className="fa-solid fa-film nav-video-item-icon" />
									数分视频
								</NavLink>
								<NavLink
									to="/new-home-video"
									className="nav-video-item"
									onClick={() => setShowVideoMenu(false)}
								>
									<i className="fa-solid fa-house nav-video-item-icon" />
									新房视频
								</NavLink>
							</div>
						)}
					</div>

					<NavLink to="/profile" exact={true} className="btn-font-lt nav-desktop-only">
						My Profile
					</NavLink>
					<button className="btn-font-lt nav-desktop-only" onClick={onLogout}>
						Logout
					</button>
					<LangToggle />
				</div>
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
						<NavLink
							to="/reviews"
							className="nav-mobile-item"
							onClick={() => setShowMobileMenu(false)}
						>
							<i className="fa-regular fa-star mr-3 text-[#94a3b8]" />
							My Reviews
						</NavLink>
						<div className="nav-mobile-divider" />
						<NavLink
							to="/chats"
							className="nav-mobile-item"
							onClick={() => setShowMobileMenu(false)}
						>
							<span className="nav-mobile-chat-wrap">
								<i className="fa-regular fa-comment mr-3 text-[#94a3b8]" />
								Chats
								{hasUnread && <span className="nav-badge-dot nav-badge-dot--mobile" />}
							</span>
						</NavLink>
						<NavLink
							to="/appointments"
							className="nav-mobile-item"
							onClick={() => setShowMobileMenu(false)}
						>
							<i className="fa-regular fa-calendar mr-3 text-[#94a3b8]" />
							Appointments
						</NavLink>

						{/* 视频 expandable section */}
						<button
							className="nav-mobile-item nav-mobile-video-header"
							onClick={() => setShowMobileVideo((v) => !v)}
						>
							<i className="fa-solid fa-video mr-3 text-[#94a3b8]" />
							视频
							<i className={`fa-solid fa-chevron-${showMobileVideo ? "up" : "down"} nav-mobile-video-chevron`} />
						</button>
						{showMobileVideo && (
							<>
								<NavLink
									to="/make-video"
									className="nav-mobile-item nav-mobile-subitem"
									onClick={() => { setShowMobileMenu(false); setShowMobileVideo(false); }}
								>
									<i className="fa-solid fa-camera-house mr-3 text-[#94a3b8]" />
									看房视频
								</NavLink>
								<NavLink
									to="/ppt-video"
									className="nav-mobile-item nav-mobile-subitem"
									onClick={() => { setShowMobileMenu(false); setShowMobileVideo(false); }}
								>
									<i className="fa-solid fa-film mr-3 text-[#94a3b8]" />
									数分视频
								</NavLink>
								<NavLink
									to="/new-home-video"
									className="nav-mobile-item nav-mobile-subitem"
									onClick={() => { setShowMobileMenu(false); setShowMobileVideo(false); }}
								>
									<i className="fa-solid fa-house mr-3 text-[#94a3b8]" />
									新房视频
								</NavLink>
							</>
						)}

						<NavLink
							to="/profile"
							className="nav-mobile-item"
							onClick={() => setShowMobileMenu(false)}
						>
							<i className="fa-regular fa-user mr-3 text-[#94a3b8]" />
							My Profile
						</NavLink>
						<button className="nav-mobile-item" onClick={onLogout}>
							<i className="fa-solid fa-right-from-bracket mr-3 text-[#94a3b8]" />
							Logout
						</button>
					</div>
				</>
			)}
		</>
	);
};

export default AgentBar;
