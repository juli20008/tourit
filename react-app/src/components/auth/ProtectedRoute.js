import React, { useEffect } from "react";
import { useSelector } from "react-redux";
import { Route } from "react-router-dom";

const API_BASE = process.env.REACT_APP_API_URL || "";

// Not logged in → Google login, then straight back to this exact URL (query
// included, e.g. /make-video?mls=…&autoquick=zh from the Chrome extension).
// Previously this redirected to "/" and silently dropped the page.
function LoginAndReturn() {
	useEffect(() => {
		window.location.href = `${API_BASE}/api/auth/google?return_to=${encodeURIComponent(window.location.href)}`;
	}, []);
	return (
		<div style={{ padding: 40, textAlign: "center", color: "#64748b" }} translate="no">
			请先登录，正在跳转到 Google 登录… / Redirecting to sign in…
		</div>
	);
}

const ProtectedRoute = (props) => {
	const user = useSelector((state) => state.session.user);
	const authChecked = useSelector((state) => state.session.authChecked);

	return (
		<Route {...props}>
			{!authChecked
				? null
				: user ? props.children : <LoginAndReturn />
			}
		</Route>
	);
};

export default ProtectedRoute;
