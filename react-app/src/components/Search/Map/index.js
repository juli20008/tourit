import React, { useRef, useEffect, useState, useMemo } from "react";
import { useParams, useHistory, useLocation } from "react-router-dom";
import { Loader } from "@googlemaps/js-api-loader";
import {
	withScriptjs,
	withGoogleMap,
	GoogleMap,
	Marker,
	InfoWindow,
} from "react-google-maps";
import Supercluster from "supercluster";

import { Modal } from "../../../context/Modal";
import Property from "../../Property";
import PropertyPreviewList from "./PropertyPreviewList";
import BottomSheet from "./BottomSheet";
import { hydrateMlsListing } from "../../../utils/mlsListingHydrator";

// Builds a circle+count SVG icon for cluster Markers.
// Must be called after the Google Maps script has loaded (window.google is available).
const clusterIcon = (count) => {
	const size = count < 10 ? 36 : count < 100 ? 44 : 54;
	const fontSize = count < 100 ? 14 : 15;
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
		<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 2}"
			fill="#2a6f97" stroke="white" stroke-width="2.5"/>
		<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
			fill="white" font-family="Arial,sans-serif" font-weight="700"
			font-size="${fontSize}">${count}</text>
	</svg>`;
	return {
		url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
		scaledSize: new window.google.maps.Size(size, size),
		anchor: new window.google.maps.Point(size / 2, size / 2),
	};
};

const MyMapLegacy = withScriptjs(
	withGoogleMap((props) => {
		const history = useHistory();
		const location = useLocation();
		const { areaParam } = useParams();
		const mapRef = useRef(null);
		const isProductionHost =
			typeof window !== "undefined" &&
			(window.location.hostname === "tourit.ca" ||
				window.location.hostname === "www.tourit.ca");
		const [googleReady, setGoogleReady] = useState(() =>
			!isProductionHost ||
			(typeof window !== "undefined" &&
				typeof window.google === "object" &&
				typeof window.google.maps === "object" &&
				typeof window.google.maps.Map === "function")
		);

		const [isOpen, setIsOpen] = useState({ openInfoWindowMarkerId: 0 });
		const [isOver, setIsOver] = useState({ id: 0 });
		const [showModal, setShowModal] = useState(false);
		const [markerModalProperty, setMarkerModalProperty] = useState(null);
		const [clusters, setClusters] = useState([]);
		const [mapBounds, setMapBounds] = useState(null);
		const [mapZoom, setMapZoom] = useState(props.zoom || 4);
		const [previewCluster, setPreviewCluster] = useState(null);
		const [selectedProperty, setSelectedProperty] = useState(null);
		// Mobile bottom sheet: array of properties (1 for pin, N for cluster)
		const [bottomSheet, setBottomSheet] = useState(null);
		const [isMobile, setIsMobile] = useState(() => window.innerWidth < 650);

		useEffect(() => {
			if (!isProductionHost || googleReady) return;
			const timer = window.setInterval(() => {
				const ready =
					typeof window.google === "object" &&
					typeof window.google.maps === "object" &&
					typeof window.google.maps.Map === "function";
				if (ready) {
					setGoogleReady(true);
				}
			}, 250);
			return () => window.clearInterval(timer);
		}, [googleReady, isProductionHost]);

		useEffect(() => {
			const handler = () => setIsMobile(window.innerWidth < 650);
			window.addEventListener("resize", handler);
			return () => window.removeEventListener("resize", handler);
		}, []);

		const iconPin = {
			path: "M256 8C119 8 8 119 8 256s111 248 248 248 248-111 248-248S393 8 256 8z",
			fillColor: "#0f172a",
			strokeColor: "#ffffff",
			strokeWeight: 2.5,
			fillOpacity: 0.98,
			scale: 0.032,
		};

		const iconOver = {
			path: "M256 8C119 8 8 119 8 256s111 248 248 248 248-111 248-248S393 8 256 8z",
			fillColor: "#1e293b",
			strokeColor: "#ffffff",
			strokeWeight: 2.5,
			fillOpacity: 1,
			scale: 0.036,
		};

		// Build a fresh supercluster index whenever the marker list changes.
		const supercluster = useMemo(() => {
			const index = new Supercluster({ radius: 60, maxZoom: 16 });
			const features = (props.markers || [])
				.filter((m) => m.lat != null && m.lng != null)
				.map((m) => ({
					type: "Feature",
					properties: { ...m, cluster: false },
					geometry: { type: "Point", coordinates: [m.lng, m.lat] },
				}));
			index.load(features);
			return index;
		}, [props.markers]);

		if (isProductionHost && !googleReady) {
			return props.loadingElement || <div style={{ height: "100%" }} />;
		}

		// Recompute visible clusters whenever bounds, zoom, or marker set changes.
		useEffect(() => {
			if (!mapBounds) return;
			const { swLat, swLng, neLat, neLng } = mapBounds;
			setClusters(
				supercluster.getClusters([swLng, swLat, neLng, neLat], mapZoom)
			);
		}, [supercluster, mapBounds, mapZoom]);

		const getBoundsPayload = () => {
			if (!mapRef.current || !mapRef.current.getBounds()) return null;
			const ne = mapRef.current.getBounds().getNorthEast();
			const sw = mapRef.current.getBounds().getSouthWest();
			const zoom = mapRef.current.getZoom();
			return {
				neLat: ne.lat(), neLng: ne.lng(),
				swLat: sw.lat(), swLng: sw.lng(),
				zoom,
			};
		};

		const setArea = () => {
			const bounds = getBoundsPayload();
			if (!bounds) return;
			const url = `/area/neLat=${bounds.neLat}&neLng=${bounds.neLng}&swLat=${bounds.swLat}&swLng=${bounds.swLng}&zoom=${bounds.zoom}`;
			if (!areaParam && props.setUrl) props.setUrl(url);
		};

		const searchArea = () => {
			const bounds = getBoundsPayload();
			if (!bounds) return;
			const url = `/area/neLat=${bounds.neLat}&neLng=${bounds.neLng}&swLat=${bounds.swLat}&swLng=${bounds.swLng}&zoom=${bounds.zoom}`;
			if (areaParam) history.push(url);
		};

		const areaFitBounds = (neLat, neLng, swLat, swLng) => {
			const bounds = new window.google.maps.LatLngBounds();
			bounds.extend(new window.google.maps.LatLng(neLat, neLng));
			bounds.extend(new window.google.maps.LatLng(swLat, swLng));
			mapRef.current.fitBounds(bounds);
		};

		const fitBounds = () => {
			const bounds = new window.google.maps.LatLngBounds();
			props.markers.forEach((m) =>
				bounds.extend(new window.google.maps.LatLng(m.lat, m.lng))
			);
			mapRef.current.fitBounds(bounds);
		};

		const handleClusterClick = (clusterId, lat, lng, count) => {
			if (count > 10) {
				setPreviewCluster(null);
				setBottomSheet(null);
				const leaves = supercluster.getLeaves(clusterId, Infinity);
				const bounds = new window.google.maps.LatLngBounds();
				leaves.forEach((leaf) => {
					const [lLng, lLat] = leaf.geometry.coordinates;
					bounds.extend(new window.google.maps.LatLng(lLat, lLng));
				});
				mapRef.current.fitBounds(bounds);
				return;
			}
			const leaves = supercluster
				.getLeaves(clusterId, Infinity)
				.map((f) => f.properties);
			if (isMobile) {
				setBottomSheet(leaves);
				return;
			}
			if (previewCluster?.clusterId === clusterId) {
				setPreviewCluster(null);
				return;
			}
			setPreviewCluster({ clusterId, lat, lng, leaves });
		};

		const handleIdle = () => {
			if (!mapRef.current || !mapRef.current.getBounds()) return;
			const ne = mapRef.current.getBounds().getNorthEast();
			const sw = mapRef.current.getBounds().getSouthWest();
			const zoom = mapRef.current.getZoom();
			setMapBounds({
				neLat: ne.lat(), neLng: ne.lng(),
				swLat: sw.lat(), swLng: sw.lng(),
			});
			setMapZoom(Math.round(zoom));
			if (props.enableAreaSearch !== false) setArea();
			if (props.onBoundsChange) props.onBoundsChange(getBoundsPayload());
		};

		// Fit to all markers on first load / when marker set changes.
		useEffect(() => {
			if (!areaParam && props.markers && props.fitBounds !== false) {
				fitBounds();
			}
		}, [props.markers, areaParam, props.fitBounds]);

		// Restore a saved area viewport.
		useEffect(() => {
			if (areaParam) {
				const [neLat, neLng, swLat, swLng] = areaParam
					.split("&")
					.map((each) => each.split("=")[1]);
				areaFitBounds(neLat, neLng, swLat, swLng);
			}
		}, []);

		useEffect(() => {
			setIsOver({ id: props.over.id });
		}, [props.over]);

		useEffect(() => {
			if (mapRef.current && props.center && props.syncCenter !== false) {
				mapRef.current.panTo(props.center);
			}
		}, [props.center, props.syncCenter]);

		// Expose flyTo to parent once on mount — parent calls fn(lat, lng) directly
		// instead of relying on useEffect prop comparison through HOC layers.
		// react-google-maps does not expose setZoom on the ref; fitBounds with a
		// small box is the reliable way to both pan and zoom imperatively.
		useEffect(() => {
			props.onMapReady?.((lat, lng) => {
				if (!mapRef.current) return;
				const d = 0.005; // ~500 m radius → roughly zoom 14
				mapRef.current.fitBounds(
					new window.google.maps.LatLngBounds(
						{ lat: lat - d, lng: lng - d },
						{ lat: lat + d, lng: lng + d }
					)
				);
			});
		}, []); // eslint-disable-line react-hooks/exhaustive-deps

		const priceLabel = (price) => {
			if (price > 1000000) return `${(price / 1000000).toFixed(1)}M`;
			return `${(price / 1000).toFixed(0)}K`;
		};

		const handlePropertySelect = async (property) => {
			const detailed = await hydrateMlsListing(property);
			setPreviewCluster(null);
			setSelectedProperty(detailed);
			history.replace({ search: `?selected=${detailed.id}` });
		};

		const closeSelectedProperty = () => {
			setSelectedProperty(null);
			history.replace({ search: "" });
		};

		// Restore modal from URL on mount (e.g. after page refresh with ?selected=123)
		useEffect(() => {
			const params = new URLSearchParams(location.search);
			const selectedId = params.get("selected");
			if (selectedId && props.markers?.length) {
				const found = props.markers.find(
					(m) => String(m.id) === selectedId
				);
				if (found) {
					hydrateMlsListing(found).then((detailed) => {
						setSelectedProperty(detailed);
					});
				}
			}
		}, [location.search, props.markers]);

		return (
			<>
				{/* For Sale / For Lease filter — top-left map overlay */}
				{props.setTransactionType && (
					<div className="absolute top-3 left-3 z-10">
						<select
							data-testid="transaction-type-filter"
							value={props.transactionType || "sale"}
							onChange={(e) => props.setTransactionType(e.target.value)}
							className="rounded-md border border-[#d6d6d0] bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[#2d2d2d] shadow-sm focus:outline-none focus:ring-2 focus:ring-[#2a6f97] cursor-pointer"
						>
							<option value="sale">For Sale</option>
							<option value="lease">For Lease</option>
						</select>
					</div>
				)}
				<GoogleMap
					ref={mapRef}
					defaultZoom={props.zoom || 4}
					defaultCenter={{ lat: props.center.lat, lng: props.center.lng }}
					defaultOptions={{ fullscreenControl: false, streetViewControl: false }}
					onIdle={handleIdle}
					onClick={() => { setPreviewCluster(null); setBottomSheet(null); }}
					onDragEnd={() => {
						if (props.enableAreaSearch !== false) searchArea();
					}}
					options={{
						disableDefaultUI: true,
						zoomControl: true,
						fullscreenControl: false,
						streetViewControl: false,
						mapTypeControl: false,
						gestureHandling: "greedy",
						styles: [
							{ elementType: "geometry", stylers: [{ color: "#efefeb" }] },
							{ elementType: "labels.text.fill", stylers: [{ color: "#61615b" }] },
							{ elementType: "labels.text.stroke", stylers: [{ color: "#efefeb" }] },
							{ featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
							{ featureType: "transit", elementType: "labels", stylers: [{ visibility: "off" }] },
							{ featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
							{ featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#efefef" }] },
							{ featureType: "water", elementType: "geometry", stylers: [{ color: "#b7d4e6" }] },
						],
					}}
				>
					<div></div>

					{clusters.map((item) => {
						const [lng, lat] = item.geometry.coordinates;
						const {
							cluster: isCluster,
							point_count: count,
							cluster_id: clusterId,
						} = item.properties;

						if (isCluster) {
							const isPreviewOpen =
								previewCluster?.clusterId === clusterId;
							return (
								<Marker
									key={`cluster-${clusterId}`}
									position={{ lat, lng }}
									icon={clusterIcon(count)}
									onClick={() =>
										handleClusterClick(clusterId, lat, lng, count)
									}
									zIndex={500}
								>
									{isPreviewOpen && (
										<InfoWindow
											onCloseClick={() => setPreviewCluster(null)}
										>
											<PropertyPreviewList
												properties={previewCluster.leaves}
												onSelect={handlePropertySelect}
											/>
										</InfoWindow>
									)}
								</Marker>
							);
						}

						// Individual property pin
						const marker = item.properties;
						const icon =
							props.over.id === marker.id ? iconOver : iconPin;
						const showInfo =
							!isMobile &&
							(isOpen.openInfoWindowMarkerId === marker.id ||
							isOver.id === marker.id);

						return (
							<Marker
								key={`pin-${marker.id}`}
								position={{ lat, lng }}
								icon={icon}
								onClick={() => {
									if (isMobile) {
										setBottomSheet([marker]);
									} else {
										hydrateMlsListing(marker).then((detailed) => {
											setSelectedProperty(null);
											setMarkerModalProperty(detailed);
											setShowModal({ show: detailed.id });
										});
									}
								}}
								onMouseOver={() => !isMobile && setIsOpen({ openInfoWindowMarkerId: marker.id })}
								onMouseOut={() => !isMobile && setIsOpen({ openInfoWindowMarkerId: 0 })}
								zIndex={props.over.id === marker.id ? 9999 : 0}
							>
								{showInfo && (
									<InfoWindow
										onCloseClick={() =>
											setIsOpen({ openInfoWindowMarkerId: 0 })
										}
									>
										<PropertyPreviewList
											properties={[marker]}
											onSelect={handlePropertySelect}
										/>
									</InfoWindow>
								)}
								{showModal.show === marker.id && (
									<Modal onClose={() => setShowModal({ show: 0 })}>
										<Property
											property={markerModalProperty || marker}
											onClose={() => {
												setShowModal({ show: 0 });
												setMarkerModalProperty(null);
											}}
										/>
									</Modal>
								)}
							</Marker>
						);
					})}
				</GoogleMap>

				{selectedProperty && (
					<Modal onClose={closeSelectedProperty}>
						<Property
							property={selectedProperty}
							onClose={closeSelectedProperty}
						/>
					</Modal>
				)}

				{bottomSheet && (
					<BottomSheet
						properties={bottomSheet}
						onSelect={handlePropertySelect}
						onClose={() => setBottomSheet(null)}
					/>
				)}
			</>
		);
	})
);

const isProductionHost = () =>
	typeof window !== "undefined" &&
	(window.location.hostname === "tourit.ca" ||
		window.location.hostname === "www.tourit.ca");

const stripAsyncQuery = (url = "") => url.replace("&loading=async", "");

const ProductionMapLoader = (props) => {
	const [ready, setReady] = useState(() => {
		if (typeof window === "undefined") return false;
		return (
			typeof window.google === "object" &&
			typeof window.google.maps === "object" &&
			typeof window.google.maps.Map === "function"
		);
	});
	const [failed, setFailed] = useState(false);

	useEffect(() => {
		if (!isProductionHost() || ready || failed) return;

		const apiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
		if (!apiKey) {
			setFailed(true);
			return;
		}

		const loader = new Loader({
			apiKey,
			version: "weekly",
			libraries: ["geometry", "drawing", "places"],
		});

		loader
			.load()
			.then(() => {
				if (
					typeof window.google === "object" &&
					typeof window.google.maps === "object" &&
					typeof window.google.maps.Map === "function"
				) {
					setReady(true);
				} else {
					setFailed(true);
				}
			})
			.catch((err) => {
				console.error("[GoogleMapsLoader]", err);
				setFailed(true);
			});
	}, [ready, failed]);

	if (!ready) {
		return props.loadingElement || <div style={{ height: "100%" }} />;
	}

	return <MyMapLegacy {...props} googleMapURL={stripAsyncQuery(props.googleMapURL)} />;
};

const MyMap = (props) => {
	if (isProductionHost()) {
		return <ProductionMapLoader {...props} />;
	}
	return <MyMapLegacy {...props} />;
};

export default MyMap;
