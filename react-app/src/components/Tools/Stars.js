import { Star } from "lucide-react";

const Stars = ({ rating }) => {
	let num = rating;
	const starArr = [];

	for (let i = 0; i < 5; i++) {
		if (num >= 1) {
			starArr.push(1);
		} else if (num < 1 && num > 0) {
			starArr.push(0.5);
		} else {
			starArr.push(0);
		}
		num -= 1;
	}

	return (
		<div className="star-wrap">
			{starArr.map((num, idx) => {
				if (num === 1)
					return (
						<Star
							key={"star" + idx}
							className="star-icon star-full"
							size={18}
							strokeWidth={1.5}
						/>
					);
				else if (num === 0.5)
					return (
						<span key={"star" + idx} className="star-half-wrap">
							<Star className="star-icon star-empty" size={18} strokeWidth={1.5} />
							<span className="star-half-fill">
								<Star className="star-icon star-full" size={18} strokeWidth={1.5} />
							</span>
						</span>
					);
				else
					return (
						<Star
							key={"star" + idx}
							className="star-icon star-empty"
							size={18}
							strokeWidth={1.5}
						/>
					);
			})}
		</div>
	);
};

export default Stars;
