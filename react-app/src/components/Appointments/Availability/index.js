import apiFetch from "../../../utils/apiFetch";
import { useEffect, useMemo, useState } from "react";

const DAY_NAMES = [
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
	"Sunday",
];

const DEFAULT_ROWS = DAY_NAMES.map((day, weekday) => ({
	weekday,
	day,
	enabled: weekday < 5,
	start_time: "09:00",
	end_time: "17:00",
}));

const buildTimeOptions = () => {
	const options = [];
	for (let hour = 7; hour <= 20; hour += 1) {
		options.push(`${String(hour).padStart(2, "0")}:00`);
		if (hour !== 20) {
			options.push(`${String(hour).padStart(2, "0")}:30`);
		}
	}
	return options;
};

const normalizeRows = (availability) =>
	DEFAULT_ROWS.map((row) => {
		const match = availability
			.filter((entry) => entry.weekday === row.weekday)
			.sort((a, b) => a.start_time.localeCompare(b.start_time))[0];

		if (match) {
			return {
				...row,
				enabled: true,
				start_time: match.start_time,
				end_time: match.end_time,
			};
		}

		return { ...row, enabled: false };
	});

const Availability = () => {
	const [rows, setRows] = useState(DEFAULT_ROWS);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [message, setMessage] = useState("");
	const timeOptions = useMemo(() => buildTimeOptions(), []);

	useEffect(() => {
		(async () => {
			try {
				const response = await apiFetch("/api/agents/me/availability");
				const data = await response.json();

				if (response.ok && Array.isArray(data.availability)) {
					setRows(
						data.availability.length ? normalizeRows(data.availability) : DEFAULT_ROWS
					);
				} else if (!response.ok) {
					setMessage(data.errors?.[0] || "Unable to load availability");
				}
			} catch (error) {
				setMessage("Unable to load availability");
			} finally {
				setLoading(false);
			}
		})();
	}, []);

	const updateRow = (weekday, field, value) => {
		setRows((current) =>
			current.map((row) =>
				row.weekday === weekday ? { ...row, [field]: value } : row
			)
		);
	};

	const saveAvailability = async () => {
		setSaving(true);
		setMessage("");

		const payload = {
			availability: rows
				.filter((row) => row.enabled)
				.map((row) => ({
					weekday: row.weekday,
					start_time: row.start_time,
					end_time: row.end_time,
				})),
		};

		try {
			const response = await apiFetch("/api/agents/me/availability", {
				method: "PUT",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(payload),
			});
			const data = await response.json();

			if (response.ok) {
				setMessage("Availability updated");
				setRows(
					data.availability && data.availability.length
						? normalizeRows(data.availability)
						: DEFAULT_ROWS.map((row) => ({ ...row, enabled: false }))
				);
			} else {
				setMessage(data.errors?.[0] || "Unable to save availability");
			}
		} catch (error) {
			setMessage("Unable to save availability");
		} finally {
			setSaving(false);
		}
	};

	if (loading) {
		return (
			<div className="availability-panel">
				<div className="availability-title">Showing Availability</div>
				<div className="availability-note">Loading your schedule...</div>
			</div>
		);
	}

	return (
		<div className="availability-panel">
			<div className="availability-head">
				<div className="availability-title">Showing Availability</div>
				<div className="availability-note">
					Default hours are weekdays from 9:00 AM to 5:00 PM.
				</div>
			</div>
			<div className="availability-grid">
				{rows.map((row) => (
					<div className="availability-row" key={row.weekday}>
						<label className="availability-day">
							<input
								type="checkbox"
								checked={row.enabled}
								onChange={(e) =>
									updateRow(row.weekday, "enabled", e.target.checked)
								}
							/>
							<span>{row.day}</span>
						</label>
						<select
							value={row.start_time}
							disabled={!row.enabled}
							onChange={(e) =>
								updateRow(row.weekday, "start_time", e.target.value)
							}
						>
							{timeOptions.map((time) => (
								<option value={time} key={`${row.weekday}-start-${time}`}>
									{time}
								</option>
							))}
						</select>
						<select
							value={row.end_time}
							disabled={!row.enabled}
							onChange={(e) =>
								updateRow(row.weekday, "end_time", e.target.value)
							}
						>
							{timeOptions.map((time) => (
								<option value={time} key={`${row.weekday}-end-${time}`}>
									{time}
								</option>
							))}
						</select>
					</div>
				))}
			</div>
			<div className="availability-actions">
				<button
					className="btn"
					type="button"
					onClick={saveAvailability}
					disabled={saving}
				>
					{saving ? "Saving..." : "Save Availability"}
				</button>
			</div>
			{message && <div className="availability-message">{message}</div>}
		</div>
	);
};

export default Availability;
