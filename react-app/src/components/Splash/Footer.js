import { NavLink } from "react-router-dom";

import footer from "../../assets/footer-art.svg";

const Footer = () => {
	return (
		<footer className="footer-ctrl">
			<NavLink to="/about" className="footer-logo-wrap">
				<img className="footer-logo" src="/Yollow.png" alt="Yollow" />
			</NavLink>

			<img src={footer} alt="Footer" />

			<div className="px-6 pb-6 text-center text-xs leading-relaxed text-[#9a9a94]">
				<p>The information provided herein is deemed reliable but is not guaranteed accurate by PROPTX.</p>
				<p className="mt-1">The information provided herein must only be used by consumers that have a bona fide interest in the purchase, sale, or lease of real estate and may not be used for any commercial purpose or any other purpose.</p>
				<p className="mt-3 text-[#b0b0a8]">Developed by Julie Li &middot; Bay Street Group</p>
			</div>
		</footer>
	);
};

export default Footer;
