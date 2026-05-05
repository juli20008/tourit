import { useEffect, useState } from "react";
import { useParams, useHistory } from "react-router-dom";
import apiFetch from "../../utils/apiFetch";
import Property from "./index";

const ListingPage = () => {
	const { mlsNumber, agentId } = useParams();
	const history = useHistory();
	const [property, setProperty] = useState(null);
	const [referralAgent, setReferralAgent] = useState(null);
	const [notFound, setNotFound] = useState(false);

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
