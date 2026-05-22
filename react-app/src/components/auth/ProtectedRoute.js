import React from "react";
import { useSelector } from "react-redux";
import { Route, Redirect } from "react-router-dom";

const ProtectedRoute = (props) => {
	const user = useSelector((state) => state.session.user);
	const authChecked = useSelector((state) => state.session.authChecked);

	return (
		<Route {...props}>
			{!authChecked
				? null
				: user ? props.children : <Redirect to="/" />
			}
		</Route>
	);
};

export default ProtectedRoute;
