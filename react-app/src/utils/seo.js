// Per-page SEO: title, description, Open Graph tags and canonical URL.
// The canonical always points at www.tourit.ca so agent subdomains
// (julieli.tourit.ca, …) aren't indexed as duplicate copies of the site.

const SITE = "https://www.tourit.ca";
// Chinese-only brand in titles: auto-translate garbles mixed text
// ("加家团队 Canada Home Team" → "加家球队 加拿大主队").
const BRAND = "加家团队";
const DEFAULT_DESC =
	"加家团队 Canada Home Team — Bay Street Group Inc., Brokerage。大多伦多华人地产经纪，万锦、列治文山、多伦多买房、卖房、出租与租房管理，普通话全程服务。";
const DEFAULT_IMAGE = `${SITE}/og-image.jpg`;

function setMeta(attr, key, content) {
	if (!content) return;
	let el = document.head.querySelector(`meta[${attr}="${key}"]`);
	if (!el) {
		el = document.createElement("meta");
		el.setAttribute(attr, key);
		document.head.appendChild(el);
	}
	el.setAttribute("content", content);
}

function setCanonical(href) {
	let el = document.head.querySelector('link[rel="canonical"]');
	if (!el) {
		el = document.createElement("link");
		el.setAttribute("rel", "canonical");
		document.head.appendChild(el);
	}
	el.setAttribute("href", href);
}

/**
 * setSeo({ title, description, path, image, noindex })
 * title: page-specific part; the brand is appended ("X | 加家团队 Canada Home Team").
 */
export function setSeo({ title, description, path, image, noindex } = {}) {
	const fullTitle = title ? `${title} | ${BRAND}` : `${BRAND} | 万锦 列治文山 大多伦多华人地产经纪`;
	const desc = (description || DEFAULT_DESC).slice(0, 300);
	const url = `${SITE}${path != null ? path : window.location.pathname}`;

	document.title = fullTitle;
	setMeta("name", "description", desc);
	setMeta("name", "robots", noindex ? "noindex, follow" : "index, follow");
	setMeta("property", "og:title", fullTitle);
	setMeta("property", "og:description", desc);
	setMeta("property", "og:url", url);
	setMeta("property", "og:image", image || DEFAULT_IMAGE);
	setCanonical(url);
}

export default setSeo;
