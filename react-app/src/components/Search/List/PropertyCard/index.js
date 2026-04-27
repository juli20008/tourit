import { useState } from "react";

import { Modal } from "../../../../context/Modal";
import Property from "../../../Property";

import PropertyTop from "./PropertyTop";

const PropertyCard = ({ property, setOver }) => {
	const [showModal, setShowModal] = useState(false);

	const onClose = () => {
		setTimeout(() => {
			setShowModal(false);
		}, 1);
	};

	return (
		<div
			className="card-ctrl group overflow-hidden rounded-lg border border-[#e1e1db] bg-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md"
			onClick={() => setShowModal(true)}
			onMouseOver={() => setOver({ id: property.id })}
			onMouseOut={() => setOver({ id: 0 })}
		>
			<PropertyTop property={property} />
			<div className="card-btm space-y-1.5 p-4">
				<div className="card-price text-[26px] font-semibold leading-tight tracking-tight text-[#1f1f1d]">
					{"$" +
						property?.price.toFixed().replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1,")}
				</div>
				<div className="card-desc text-[14px] text-[#666660]">
					{property?.bed} bd{property?.bed > 1 && <span>s</span>}{" "}
					{property?.bath} ba {property?.sqft} sqft
				</div>
				<div className="card-address text-[16px] font-medium leading-snug text-[#353531]">
					{property?.street}, {property?.city}, {property?.state}{" "}
					{property?.zip}
				</div>
				<div className="card-office pt-1 text-[16px] font-medium leading-snug text-[#353531]">
					Brokerage:{" "}
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
					<Property property={property} onClose={onClose} />
				</Modal>
			)}
		</div>
	);
};

export default PropertyCard;
