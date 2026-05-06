import { useEffect, useState } from "react";
import { useParams, useHistory } from "react-router-dom";
import apiFetch from "../../utils/apiFetch";
import Property from "./index";

// Embeds listing data as a JSON script tag for the Tourit→FBMP Chrome extension.
function useFbmpEmbed(property) {
	useEffect(() => {
		if (!property) return;
		const street = [property.street_number, property.street_name, property.street_suffix]
			.filter(Boolean).join(" ");
		const unit = property.unit_number ? `#${property.unit_number} ` : "";
		const address = `${unit}${street}`;
		const payload = {
			mls_number: property.mls_number,
			title: `${property.bed ?? "?"}BR ${property.style || property.property_type || "Home"} for Rent | ${address}, ${property.city || ""}`,
			price: property.list_price,
			description: property.description || "",
			address,
			city: property.city || "",
			state: property.state || "",
			zip: property.zip || "",
			beds: property.bed,
			baths: property.bath,
			property_type: property.property_type || "",
			style: property.style || "",
			images: property.images || [],
		};

		let el = document.getElementById("tourit-listing-data");
		if (!el) {
			el = document.createElement("script");
			el.id = "tourit-listing-data";
			el.type = "application/json";
			document.head.appendChild(el);
		}
		el.textContent = JSON.stringify(payload);

		return () => { el.remove(); };
	}, [property]);
}

const ListingPage = () => {
	const { mlsNumber, agentId } = useParams();
	const history = useHistory();
	const [property, setProperty] = useState(null);
	const [referralAgent, setReferralAgent] = useState(null);
	const [notFound, setNotFound] = useState(false);
	useFbmpEmbed(property);

	useEffect(() => {
		apiFetch(`/api/listings/${encodeURIComponent(mlsNumber)}`)
			.then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
			.then((data) => {
				if (data.listing) setProperty(data.listing);
				else setNotFound(true);
			})
			.catch(() => setNotFound(true));
	}, [mlsNumber]);

	useEffect(() => {
		if (!agentId) return;
		apiFetch(`/api/agents/${agentId}`)
			.then((r) => (r.ok ? r.json() : null))
			.then((data) => { if (data?.agent) setReferralAgent(data.agent); })
			.catch(() => {});
	}, [agentId]);

	const handleClose = () => {
		if (history.length > 2) history.goBack();
		else history.replace("/");
	};

	if (notFound) {
		return (
			<div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-gray-500">
				<p className="text-lg font-medium">Listing not found.</p>
				<button className="text-sm underline" onClick={() => history.replace("/")}>
					Back to Search
				</button>
			</div>
		);
	}

	if (!property) {
		return (
			<div className="flex items-center justify-center min-h-[60vh] text-gray-400 text-sm">
				Loading…
			</div>
		);
	}

	return (
		<div className="listing-page-wrap">
			<Property property={property} onClose={handleClose} referralAgent={referralAgent} isPage />
		</div>
	);
};

export default ListingPage;
