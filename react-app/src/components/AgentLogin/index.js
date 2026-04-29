import { useState } from "react";
import { Link, useLocation } from "react-router-dom";

const rawApiBase = process.env.REACT_APP_API_URL || "";
const API_BASE = rawApiBase
	? rawApiBase.replace(/^http:\/\//i, "https://").replace(/\/$/, "")
	: (typeof window !== "undefined" && window.location.hostname === "localhost" ? "" : "https://api.tourit.ca");

const AgentLogin = () => {
	const location = useLocation();
	const params = new URLSearchParams(location.search);
	const hasError = params.get("error") === "invalid";

	const [email, setEmail] = useState("");
	const [status, setStatus] = useState(hasError ? "link-error" : "idle"); // idle | loading | sent | error | link-error
	const [errorMsg, setErrorMsg] = useState("");

	const handleSubmit = async (e) => {
		e.preventDefault();
		if (!email.trim()) return;
		setStatus("loading");
		setErrorMsg("");

		try {
			const res = await fetch(`${API_BASE}/api/auth/agent-magic-link`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({ email: email.trim().toLowerCase() }),
			});
			if (res.ok) {
				setStatus("sent");
			} else {
				const data = await res.json().catch(() => ({}));
				setErrorMsg((data.errors || [])[0] || "Something went wrong. Please try again.");
				setStatus("error");
			}
		} catch {
			setErrorMsg("Unable to reach the server. Please try again.");
			setStatus("error");
		}
	};

	return (
		<div className="min-h-screen bg-[#f3f3f1] flex flex-col">
			<main className="flex-1 flex items-center justify-center px-4 py-16">
				<div className="w-full max-w-sm bg-white rounded-2xl shadow-md px-8 py-10">

					{status === "sent" ? (
						<div className="text-center flex flex-col items-center gap-4">
							<div className="w-12 h-12 rounded-full bg-[#ecfdf5] flex items-center justify-center">
								<svg className="w-6 h-6 text-[#059669]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
									<path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
								</svg>
							</div>
							<div>
								<div className="text-lg font-bold text-[#0f172a]">Check your inbox</div>
								<p className="text-sm text-[#64748b] mt-1 leading-relaxed">
									We sent a login link to <span className="font-medium text-[#0f172a]">{email}</span>.<br />
									The link expires in 30 minutes.
								</p>
							</div>
							<button
								type="button"
								onClick={() => setStatus("idle")}
								className="mt-2 text-sm text-[#64748b] hover:text-[#0f172a] transition underline underline-offset-2"
							>
								Use a different email
							</button>
						</div>
					) : (
						<>
							<div className="mb-7">
								<div className="text-2xl font-bold text-[#0f172a] tracking-tight">Agent Login</div>
								<p className="text-sm text-[#64748b] mt-1">
									Enter your email and we'll send you a secure login link.
								</p>
							</div>

							{(status === "link-error") && (
								<div className="mb-5 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
									That login link is invalid or has expired. Please request a new one.
								</div>
							)}

							{status === "error" && errorMsg && (
								<div className="mb-5 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
									{errorMsg}
								</div>
							)}

							<form onSubmit={handleSubmit} className="flex flex-col gap-4">
								<div className="flex flex-col gap-1.5">
									<label htmlFor="agent-email" className="text-sm font-medium text-[#374151]">
										Email address
									</label>
									<input
										id="agent-email"
										type="email"
										autoComplete="email"
										autoFocus
										required
										value={email}
										onChange={(e) => setEmail(e.target.value)}
										placeholder="you@brokerage.com"
										className="w-full rounded-lg border border-[#d1d5db] px-4 py-2.5 text-sm text-[#0f172a] placeholder-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#0f172a]/20 focus:border-[#0f172a] transition"
									/>
								</div>

								<button
									type="submit"
									disabled={status === "loading"}
									className="w-full rounded-lg bg-[#0f172a] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1e293b] transition disabled:opacity-60 disabled:cursor-not-allowed"
								>
									{status === "loading" ? "Sending…" : "Send Login Link"}
								</button>
							</form>

							<p className="mt-6 text-center text-xs text-[#9ca3af]">
								Not an agent?{" "}
								<Link to="/" className="font-medium text-[#0f172a] hover:underline">
									Back to home
								</Link>
							</p>
						</>
					)}
				</div>
			</main>
		</div>
	);
};

export default AgentLogin;
