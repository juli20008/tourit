import React, { useState, useEffect } from "react";
import { BrowserRouter, Redirect, Route, Switch } from "react-router-dom";
import { useDispatch } from "react-redux";
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

import About from "./components/About";
import AgentLogin from "./components/AgentLogin";

function App() {
	const [loaded, setLoaded] = useState(false);
	const dispatch = useDispatch();
	const defaultArea =
		"/area/neLat=44.20&neLng=-78.90&swLat=43.30&swLng=-80.80&zoom=10"; // Toronto GTA

	useEffect(() => {
		(async () => {
			await dispatch(authenticate());
			setLoaded(true);
		})();
	}, [dispatch]);

	if (!loaded) {
		return null;
	}

	return (
		<BrowserRouter>
			<NavBar />
			<Notification />
			<Switch>
				<Route path="/" exact={true}>
					<Redirect to={defaultArea} />
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
		</BrowserRouter>
	);
}

export default App;
