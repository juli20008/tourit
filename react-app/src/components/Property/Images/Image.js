import { useState } from "react";

import { Modal } from "../../../context/Modal";
import { resolveUrl, FALLBACK_IMAGE } from "../../../utils/imageResolver";

const Image = ({ image }) => {
	const [showModal, setShowModal] = useState(false);
	const imageUrl = resolveUrl(image?.img_url) || FALLBACK_IMAGE;

	return (
		<>
			<img
				className="property-img"
				src={imageUrl}
				alt="Gallery"
				onClick={() => setShowModal(true)}
				onError={(e) => {
					e.currentTarget.onerror = null;
					e.currentTarget.src = FALLBACK_IMAGE;
				}}
			/>
			{showModal && (
				<Modal onClose={() => setShowModal(false)}>
					<img
						className="property-img-lg"
						src={imageUrl}
						alt="Gallery"
						onClick={() => setShowModal(false)}
						onError={(e) => {
							e.currentTarget.onerror = null;
							e.currentTarget.src = FALLBACK_IMAGE;
						}}
					/>
				</Modal>
			)}
		</>
	);
};

export default Image;
