import { useEffect, useRef, useState } from "react";

import { Modal } from "../../../../context/Modal";
import Property from "../../../Property";
import { hydrateMlsListing } from "../../../../utils/mlsListingHydrator";

import PropertyTop from "./PropertyTop";

const PropertyCard = ({ property, setOver }) => {
	const [showModal, setShowModal] = useState(false);
	const [activeProperty, setActiveProperty] = useState(property);
	const prevUrl = useRef(null);

	useEffect(() => {
		setActiveProperty(property);
	}, [property]);

	const onClose = () => {
		setShowModal(false);
		if (prevUrl.current) {
			window.history.replaceState(null, "", prevUrl.current);
			prevUrl.current = null;
		}
	};

	const handleOpen = async (e) => {
		// Portal elements (modal backdrop, close button) are outside this card's
		// DOM subtree, so contains() returns false — bail to avoid zombie re-open.
		if (e && !e.currentTarget.contains(e.target)) return;
		const detailed = await hydrateMlsListing(property);
		setActiveProperty(detailed);
		const mlsNum = property?.mls_number || property?.listing_id;
		if (mlsNum) {
			prevUrl.current = window.location.href;
			window.history.replaceState(null, "", `/listing/${encodeURIComponent(mlsNum)}`);
		}
		setShowModal(true);
	};

	return (
		<div
			className="card-ctrl group overflow-hidden rounded-lg border border-[#e1e1db] bg-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md"
			onClick={handleOpen}
			onMouseOver={() => setOver({ id: property.id })}
			onMouseOut={() => setOver({ id: 0 })}
		>
			<PropertyTop property={property} />
			<div className="card-btm space-y-0.5 px-3 py-2.5">
				<div className="card-price text-[26px] font-semibold leading-tight tracking-tight text-[#1f1f1d]">
					{"$" +
						property?.price.toFixed().replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1,")}
				</div>
				<div className="card-desc text-[14px] text-[#55585f]">
					{property?.beds_above_grade > 0 && property?.basement_beds > 0
						? `${property.beds_above_grade}+${property.basement_beds} bd`
						: `${property?.bed ?? ""} bd`}{" "}
					{property?.bath} ba {property?.sqft} sqft
				</div>
				<div className="card-address text-[16px] font-medium leading-snug text-[#676a71]">
					{property?.street}, {property?.city}, {property?.state}{" "}
					{property?.zip}
				</div>
				<hr className="border-[#e1e1db]" />
				<div className="card-office text-[14px] font-normal leading-snug text-[#676a71]">
					{
						property?.brokerage ||
						property?.office ||
						property?.listing_brokerage ||
						"N/A"
					}
				</div>
			</div>
			{showModal && (
				<Modal onClose={onClose}>
					<Property property={activeProperty} onClose={onClose} />
				</Modal>
			)}
		</div>
	);
};

export default PropertyCard;
