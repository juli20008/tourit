import React, { useState, useEffect } from "react";
import { BrowserRouter, Redirect, Route, Switch, useHistory } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import LoginForm from "./components/auth/LoginForm";
import SignUpForm from "./components/auth/SignUpForm";
import NavBar from "./components/NavBar";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import Search from "./components/Search";
import SearchArea from "./components/Search/SearchArea";
import Appointments from "./components/Appointments";
import Notification from "./components/Tools/Notification";
import Agents from "./components/Agents";
import Agent from "./components/Agent";
import NotFound from "./components/NotFound";
import Profile from "./components/Profile";
import Reviews from "./components/Reviews";
import Chats from "./components/Chats";
import { authenticate } from "./store/session";
import { initWhitelabel } from "./store/whitelabel";

import About from "./components/About";
import AgentLogin from "./components/AgentLogin";
import ListingPage from "./components/Property/ListingPage";

const DEFAULT_AREA = "/area/neLat=44.20&neLng=-78.90&swLat=43.30&swLng=-80.80&zoom=10";

// Keeps a hidden DOM element in sync with agent login status so the
// Tourit Chrome extension content script can read it.
const AgentStatusEmbed = () => {
	const user = useSelector((state) => state.session.user);
	useEffect(() => {
		let el = document.getElementById('tourit-user-data');
		if (!el) {
			el = document.createElement('script');
			el.id = 'tourit-user-data';
			el.type = 'application/json';
			document.head.appendChild(el);
		}
		el.textContent = JSON.stringify({
			is_agent:    !!(user?.agent),
			account_key: user?.agent ? `agent_${user.id}` : null,
		});
		return () => { try { el.remove(); } catch {} };
	}, [user]);
	return null;
};

// Runs once after Google OAuth callback: if sessionStorage has a saved listing,
// navigate to it so the user can resume booking.
const TourReturnHandler = () => {
	const history = useHistory();
	const user = useSelector((state) => state.session.user);

	useEffect(() => {
		if (!user) return;
		const raw = sessionStorage.getItem("tourReturn");
		if (!raw) return;
		try {
			const { path, propertyId } = JSON.parse(raw);
			if (path) {
				history.replace(path);
				return;
			}
			history.replace(`${DEFAULT_AREA}?selected=${encodeURIComponent(propertyId)}`);
		} catch {
			sessionStorage.removeItem("tourReturn");
		}
	}, [user]); // eslint-disable-line react-hooks/exhaustive-deps

	return null;
};

function App() {
	const [loaded, setLoaded] = useState(false);
	const dispatch = useDispatch();

	useEffect(() => {
		(async () => {
			await dispatch(authenticate());
			setLoaded(true);
			dispatch(initWhitelabel());
		})();
	}, [dispatch]);

	if (!loaded) {
		return null;
	}

	return (
		<BrowserRouter>
			<AgentStatusEmbed />
			<TourReturnHandler />
			<NavBar />
			<Notification />
<Switch>
				<Route path="/" exact={true}>
					<Redirect to={DEFAULT_AREA} />
				</Route>
				<Route path="/search/:searchParam" exact={true}>
					<Search />
				</Route>
				<Route path="/area/:areaParam" exact={true}>
					<SearchArea />
				</Route>
				<Route path="/login" exact={true}>
					<LoginForm />
				</Route>
				<Route path="/sign-up" exact={true}>
					<SignUpForm />
				</Route>
				<Route path="/agents" exact={true}>
					<Agents />
				</Route>
				<Route path="/agents/:agentId">
					<Agent />
				</Route>
				<Route path="/about" exact={true}>
					<About />
				</Route>
				<Route path="/agent-login" exact={true}>
					<AgentLogin />
				</Route>
				<Route path="/a/:agentId/listing/:mlsNumber" exact={true}>
					<ListingPage />
				</Route>
				<Route path="/listing/:mlsNumber" exact={true}>
					<ListingPage />
				</Route>
				<ProtectedRoute path="/appointments" exact={true}>
					<Appointments />
				</ProtectedRoute>
				<ProtectedRoute path="/profile" exact={true}>
					<Profile />
				</ProtectedRoute>
				<ProtectedRoute path="/reviews" exact={true}>
					<Reviews />
				</ProtectedRoute>
				<ProtectedRoute path={["/chats", "/chats/:channelId"]} exact={true}>
					<Chats />
				</ProtectedRoute>
				<Route>
					<NotFound />
				</Route>
			</Switch>
			<footer className="app-footer">
				<span style={{ marginRight: '12px', opacity: 0.6 }}>⚠ Beta version — features may change without notice.</span>
&copy; 2026 Tourit. All rights reserved. &nbsp;&middot;&nbsp; Julie Li, Bay Street Group &nbsp;&middot;&nbsp; 905-909-0101
			</footer>
		</BrowserRouter>
	);
}

export default App;
