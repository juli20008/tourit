import { useDispatch } from "react-redux";
import { useHistory } from "react-router-dom";
import { login } from "../../../store/session";
import { useNotification } from "../../../context/Notification";

const API_BASE = process.env.REACT_APP_API_URL || "";

const Login = ({ onClose, inline = false }) => {
	const dispatch = useDispatch();
	const history = useHistory();
	const { setToggleNotification, setNotificationMsg } = useNotification();

	const handleGoogleLogin = () => {
		window.location.href = `${API_BASE}/api/auth/google`;
	};

	const demoLogin = async (email, redirectTo) => {
		const data = await dispatch(login(email, "password"));
		if (!data) {
			if (onClose) onClose();
			history.push(redirectTo);
		} else {
			setNotificationMsg(data[0] || "Demo login failed");
			setToggleNotification("");
			setTimeout(() => {
				setToggleNotification("notification-move");
				setNotificationMsg("");
			}, 2000);
		}
	};

	return (
		<div className={`flex flex-col items-center gap-5 px-6 py-6 w-full${inline ? "" : " max-w-sm mx-auto bg-white rounded-2xl shadow-xl"}`}>
			<div className="text-center">
				<div className="text-2xl font-bold text-[#0f172a] tracking-tight">Welcome</div>
				<div className="text-sm text-[#64748b] mt-1">Sign in to book showings.</div>
			</div>

			{/* Google button */}
			<button
				type="button"
				onClick={handleGoogleLogin}
				className="w-full flex items-center justify-center gap-3 rounded-lg border border-[#d1d5db] bg-white px-4 py-3 text-sm font-semibold text-[#1e293b] shadow-sm hover:bg-[#f9fafb] transition"
			>
				<svg width="20" height="20" viewBox="0 0 48 48">
					<path fill="#EA4335" d="M24 9.5c3.14 0 5.95 1.08 8.17 2.84l6.08-6.08C34.41 3.07 29.49 1 24 1 14.82 1 7.09 6.48 3.73 14.22l7.1 5.52C12.5 13.59 17.78 9.5 24 9.5z"/>
					<path fill="#4285F4" d="M46.14 24.5c0-1.56-.14-3.07-.4-4.5H24v8.51h12.44c-.54 2.9-2.18 5.36-4.64 7.01l7.19 5.58C43.46 37.1 46.14 31.27 46.14 24.5z"/>
					<path fill="#FBBC05" d="M10.83 28.26A14.6 14.6 0 0 1 9.5 24c0-1.49.26-2.93.73-4.26l-7.1-5.52A23.93 23.93 0 0 0 .5 24c0 3.86.92 7.51 2.63 10.72l7.7-6.46z"/>
					<path fill="#34A853" d="M24 46.5c5.49 0 10.1-1.82 13.46-4.93l-7.19-5.58c-1.89 1.27-4.3 2.01-6.27 2.01-6.22 0-11.5-4.09-13.17-9.74l-7.7 6.46C7.09 42.02 14.82 46.5 24 46.5z"/>
				</svg>
				Continue with Google
			</button>

			{/* Demo divider */}
			<div className="w-full flex items-center gap-3">
				<div className="flex-1 h-px bg-[#e5e7eb]" />
				<span className="text-xs text-[#9ca3af]">demo only</span>
				<div className="flex-1 h-px bg-[#e5e7eb]" />
			</div>

			<div className="w-full flex flex-col gap-2">
				<button
					type="button"
					className="w-full rounded-md border border-[#d1d5db] bg-white px-4 py-2.5 text-sm text-[#374151] hover:bg-[#f9fafb] transition"
					onClick={() => demoLogin("demo@aa.io", "/")}
				>
					User Demo Login
				</button>
				<button
					type="button"
					className="w-full rounded-md bg-[#0f172a] px-4 py-2.5 text-sm text-white hover:bg-[#1e293b] transition"
					onClick={() => demoLogin("agent1@user.com", "/appointments")}
				>
					Agent Demo Login
				</button>
			</div>
		</div>
	);
};

export default Login;
