import { Star } from "lucide-react";

const Stars = ({ rating = 0 }) => {
	const safeRating = Math.max(0, Math.min(5, rating));

	return (
		<div className="big-star-wrap">
			{Array.from({ length: 5 }).map((_, idx) => {
				const fill = Math.max(0, Math.min(1, safeRating - idx));
				return (
					<span key={`big-star-${idx}`} className="big-star-unit">
						<Star className="big-star-icon big-star-empty" size={34} strokeWidth={1.5} />
						<span className="big-star-fill" style={{ width: `${fill * 100}%` }}>
							<Star className="big-star-icon big-star-full" size={34} strokeWidth={1.5} />
						</span>
					</span>
				);
			})}
		</div>
	);
};

export default Stars;
