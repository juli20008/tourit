import { NavLink } from "react-router-dom";

import footer from "../../assets/footer-art.svg";

const Footer = () => {
	return (
		<footer className="footer-ctrl">
			<NavLink to="/about" className="footer-logo-wrap">
				<img className="footer-logo" src="/Yollow.png" alt="Yollow" />
			</NavLink>

			<img src={footer} alt="Footer" />
		</footer>
	);
};

export default Footer;
