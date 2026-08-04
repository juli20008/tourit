import { NavLink } from "react-router-dom";

const Footer = () => {
	return (
		<footer className="footer-ctrl">
			{/* Brand */}
			<NavLink to="/about" className="footer-brand-wrap">
				<div className="footer-brand-name">
					<span className="footer-brand-zh">加家团队</span>
					<span className="footer-brand-dot">·</span>
					<span className="footer-brand-en">Canada Home Team</span>
				</div>
				<div className="footer-brand-sub">Markham &amp; Richmond Hill Specialists</div>
			</NavLink>

			{/* Contact row */}
			<div className="footer-contacts">
				<a className="footer-contact-item" href="tel:6475426760">
					<i className="fa-solid fa-phone footer-contact-icon" />
					<span>Julie Li — 647.542.6760</span>
				</a>
				<span className="footer-contact-sep" />
				<a className="footer-contact-item" href="tel:6478244898">
					<i className="fa-solid fa-phone footer-contact-icon" />
					<span>Sara Tian — 647.824.4898</span>
				</a>
			</div>

			{/* Brokerage */}
			<div className="footer-brokerage">
				<i className="fa-solid fa-building-columns footer-brokerage-icon" />
				<span>Bay Street Group Inc. Brokerage &nbsp;·&nbsp; 8300 Woodbine Ave, Suite 500, Markham ON L3R 9Y7</span>
			</div>

			{/* Divider */}
			<div className="footer-divider" />

			{/* Disclaimer */}
			<div className="footer-disclaimer">
				<p>The information provided herein is deemed reliable but is not guaranteed accurate by PROPTX.</p>
				<p>The information provided herein must only be used by consumers that have a bona fide interest in the purchase, sale, or lease of real estate and may not be used for any commercial purpose or any other purpose.</p>
			</div>
		</footer>
	);
};

export default Footer;
