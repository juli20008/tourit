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

// ── Community boundary overlay (torontomls.net tile layer) ────────────────────

// Bing quadkey ↔ Google Maps tile (x, y, zoom) — same Mercator projection,
// same origin, so only the key encoding differs.
function tileToQuadKey(x, y, zoom) {
  let key = '';
  for (let i = zoom; i > 0; i--) {
    let d = 0;
    const mask = 1 << (i - 1);
    if (x & mask) d++;
    if (y & mask) d += 2;
    key += d;
  }
  return key;
}

// Walk the react-google-maps context to get the native google.maps.Map instance.
function getNativeMap(gmRef) {
  const ctx = gmRef.current?.context;
  if (!ctx) return null;
  const keys = [...Object.keys(ctx), ...Object.getOwnPropertySymbols(ctx)];
  for (const k of keys) {
    const v = ctx[k];
    if (v && typeof v.overlayMapTypes !== 'undefined') return v;
  }
  return null;
}

const LAYER_CONFIGS = {
  communities:    'Layer_Communities',
  municipalities: 'Layer_Municipalities',
  areas:          'Layer_Areas',
};

// ── Compute pixelOffset so the InfoWindow card stays within the visible map area.
const getInfoWindowOptions = (markerLat, markerLng, mapRef) => {
  if (!mapRef?.current) return {};
  const map = mapRef.current;
  const bounds = map.getBounds();
  if (!bounds) return {};

  const ne = bounds.getNorthEast();
  const sw = bounds.getSouthWest();
  const latSpan = ne.lat() - sw.lat();
  const lngSpan = ne.lng() - sw.lng();
  if (!latSpan || !lngSpan) return {};

  // Map container size in pixels
  let mapW = 800, mapH = 500;
  try {
    const div = map.getDiv?.();
    if (div) { mapW = div.offsetWidth || mapW; mapH = div.offsetHeight || mapH; }
  } catch (_) {}

  // Marker pixel position from the top-left corner of the map
  const px = ((markerLng - sw.lng()) / lngSpan) * mapW;
  const py = ((ne.lat() - markerLat) / latSpan) * mapH;

  // Approximate card dimensions including Google's arrow/chrome (~30 px)
  const CARD_W = 370;
  const CARD_H = 240;
  const MARGIN = 12;

  // Horizontal: card body is centered on the tip — clamp within map bounds
  let offsetX = 0;
  if (px + CARD_W / 2 > mapW - MARGIN) {
    offsetX = mapW - MARGIN - px - CARD_W / 2;  // shift left (negative)
  } else if (px - CARD_W / 2 < MARGIN) {
    offsetX = MARGIN - px + CARD_W / 2;          // shift right (positive)
  }

  // Vertical: default card opens above the marker; if near top edge, flip below
  let offsetY = 0;
  if (py < CARD_H + MARGIN) {
    // Moving tip this far down puts the card body just below the marker
    offsetY = CARD_H + 30;
  }

  if (offsetX === 0 && offsetY === 0) return {};
  return { pixelOffset: new window.google.maps.Size(Math.round(offsetX), Math.round(offsetY)) };
};
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

const priceLabel = (price) => {
	if (price >= 1000000) return `${(price / 1000000).toFixed(1)}M`;
	return `${Math.round(price / 1000)}K`;
};

const priceIcon = (price, isOver) => {
	const label = priceLabel(price || 0);
	const w = Math.max(40, label.length * 8 + 16);
	const h = 24;
	const r = 12;
	const arrowH = 6;
	const totalH = h + arrowH;
	const cx = w / 2;
	const bg = isOver ? "#1e293b" : "#0f172a";
	// Single path: rounded rect + triangle tip — no seam between pill and arrow
	const d = `M ${r},0 H ${w - r} Q ${w},0 ${w},${r} V ${h - r} Q ${w},${h} ${w - r},${h} H ${cx + 5} L ${cx},${totalH} L ${cx - 5},${h} H ${r} Q 0,${h} 0,${h - r} V ${r} Q 0,0 ${r},0 Z`;
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${totalH}">
		<path d="${d}" fill="${bg}" stroke="white" stroke-width="2"/>
		<text x="${cx}" y="${h / 2}" dominant-baseline="middle" text-anchor="middle"
			fill="white" font-family="Arial,sans-serif" font-weight="700" font-size="12">${label}</text>
	</svg>`;
	return {
		url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
		scaledSize: new window.google.maps.Size(w, totalH),
		anchor: new window.google.maps.Point(cx, totalH),
	};
};

const MapCore = withGoogleMap((props) => {
		const history = useHistory();
		const location = useLocation();
		const { areaParam } = useParams();
		const mapRef = useRef(null);
		const prevUrlRef = useRef(null);
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
		const [activeLayer, setActiveLayer] = useState('communities');
		const overlayRef = useRef(null);

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

		// Add / swap / remove the community boundary tile overlay
		useEffect(() => {
			if (!window.google?.maps) return;
			const nativeMap = getNativeMap(mapRef);
			if (!nativeMap) return;

			// Remove previous overlay
			if (overlayRef.current) {
				const types = nativeMap.overlayMapTypes;
				for (let i = 0; i < types.getLength(); i++) {
					if (types.getAt(i) === overlayRef.current) { types.removeAt(i); break; }
				}
				overlayRef.current = null;
			}

			if (!activeLayer) return;

			const tileName = LAYER_CONFIGS[activeLayer];
			const layer = new window.google.maps.ImageMapType({
				getTileUrl: (coord, zoom) =>
					`https://www.torontomls.net/BingCommunitiesMap/BingMapData/${tileName}/${tileToQuadKey(coord.x, coord.y, zoom)}.png`,
				tileSize: new window.google.maps.Size(256, 256),
				opacity: 0.65,
				name: tileName,
			});
			nativeMap.overlayMapTypes.push(layer);
			overlayRef.current = layer;
		}, [activeLayer]);

		// Build a fresh supercluster index whenever the marker list changes.
		const supercluster = useMemo(() => {
			const index = new Supercluster({ radius: 60, minPoints: 3, maxZoom: 16 });
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
			if (!mapRef.current) return;
			const n = parseFloat(neLat), s = parseFloat(swLat);
			const e = parseFloat(neLng), w = parseFloat(swLng);
			if ([n, s, e, w].some(isNaN)) return;
			mapRef.current.fitBounds({ north: n, south: s, east: e, west: w });
		};

			const fitBounds = () => {
			if (!mapRef.current || !props.markers?.length) return;
			const lats = props.markers.map(m => parseFloat(m.lat)).filter(v => !isNaN(v));
			const lngs = props.markers.map(m => parseFloat(m.lng)).filter(v => !isNaN(v));
			if (!lats.length || !lngs.length) return;
			mapRef.current.fitBounds({
				north: Math.max(...lats),
				south: Math.min(...lats),
				east: Math.max(...lngs),
				west: Math.min(...lngs),
			});
		};

		const handleClusterClick = (clusterId, lat, lng, count) => {
			if (count > 25) {
				setPreviewCluster(null);
				setBottomSheet(null);
				const leaves = supercluster.getLeaves(clusterId, Infinity);
				const clats = leaves.map(l => l.geometry.coordinates[1]);
				const clngs = leaves.map(l => l.geometry.coordinates[0]);
				mapRef.current.fitBounds({
					north: Math.max(...clats),
					south: Math.min(...clats),
					east: Math.max(...clngs),
					west: Math.min(...clngs),
				});
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
		// Skip while a popup is open to prevent the map from jumping.
		useEffect(() => {
			if (!areaParam && props.markers?.length && props.fitBounds !== false && mapRef.current && !previewCluster && !bottomSheet) {
				fitBounds();
			}
		}, [props.markers, areaParam, props.fitBounds, previewCluster, bottomSheet]);

				// Restore a saved area viewport.
		// IMPORTANT: areaParam has format "neLat=43.7&neLng=-79.3&swLat=43.6&swLng=-79.4&zoom=12"
		// Use parseFloat() to convert each value from string to number.
		// Destructure only the first 4 values (neLat, neLng, swLat, swLng);
		// the 5th value (zoom) is intentionally discarded here since fitBounds doesn't need it.
		useEffect(() => {
			if (areaParam) {
				const parts = areaParam
					.split("&")
					.map((each) => parseFloat(each.split("=")[1]));
				const [neLat, neLng, swLat, swLng] = parts;
				areaFitBounds(neLat, neLng, swLat, swLng);
			}
		}, []);

		useEffect(() => {
			const id = props.over?.id;
			setIsOver({ id });
			// On mobile there is no InfoWindow — use BottomSheet instead.
			// This fires when fly-to (address search) highlights a nearby listing.
			if (isMobile && id && id !== 0) {
				const found = (props.markers || []).find(
					(m) => m.id === id || String(m.id) === String(id)
				);
				if (found) setBottomSheet([found]);
			}
		}, [props.over]); // eslint-disable-line react-hooks/exhaustive-deps

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
			props.onMapReady?.((lat, lng, bounds) => {
				if (!mapRef.current) return;
				if (bounds) {
					mapRef.current.fitBounds(bounds);
				} else {
					mapRef.current.setCenter({ lat, lng });
					mapRef.current.setZoom(6);
				}
			});
		}, []); // eslint-disable-line react-hooks/exhaustive-deps

		const handlePropertySelect = async (property) => {
			const detailed = await hydrateMlsListing(property);
			setPreviewCluster(null);
			setSelectedProperty(detailed);
			const mls = detailed?.mls_number;
			if (mls) {
				prevUrlRef.current = window.location.href;
				window.history.replaceState(null, '', `/listing/${encodeURIComponent(mls)}`);
			}
		};

		const closeSelectedProperty = () => {
			setSelectedProperty(null);
			if (prevUrlRef.current) {
				window.history.replaceState(null, '', prevUrlRef.current);
				prevUrlRef.current = null;
			}
		};

		// Restore modal from URL on mount (e.g. after page refresh with ?selected=123).
		// The cancelled flag prevents a stale async call (started before the user
		// clicked close) from calling setSelectedProperty after the modal is gone.
		useEffect(() => {
			let cancelled = false;
			const params = new URLSearchParams(location.search);
			const selectedId = params.get("selected");
			if (selectedId && props.markers?.length) {
				const found = props.markers.find(
					(m) => String(m.id) === selectedId
				);
				if (found) {
					hydrateMlsListing(found).then((detailed) => {
						if (!cancelled) setSelectedProperty(detailed);
					});
				}
			}
			return () => { cancelled = true; };
		}, [location.search, props.markers]);

		return (
			<>
				{/* For Sale / For Lease filter — top-left map overlay */}
				{props.setTransactionType && (
					<div className="absolute top-3 left-3 z-10">
						<select
							data-testid="transaction-type-filter"
							value={props.transactionType || "For Sale"}
							onChange={(e) => props.setTransactionType(e.target.value)}
							className="rounded-md border border-[#d6d6d0] bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[#2d2d2d] shadow-sm focus:outline-none focus:ring-2 focus:ring-[#2a6f97] cursor-pointer"
						>
							<option value="For Sale">For Sale</option>
							<option value="For Lease">For Lease</option>
						</select>
					</div>
				)}
				{/* MLS boundary layer toggle — top-right map overlay */}
				<div className="absolute top-3 right-3 z-10 flex gap-1">
					{[
						{ key: 'communities',    label: 'Communities' },
						{ key: 'municipalities', label: 'Districts' },
						{ key: 'areas',          label: 'Areas' },
					].map(({ key, label }) => (
						<button
							key={key}
							onClick={() => setActiveLayer(l => l === key ? null : key)}
							className={`rounded-md border px-2 py-1 text-[11px] font-semibold shadow-sm transition
								${activeLayer === key
									? 'bg-[#1e293b] text-white border-[#1e293b]'
									: 'bg-white text-[#2d2d2d] border-[#d6d6d0] hover:bg-[#f1f5f9]'}`}
						>
							{label}
						</button>
					))}
				</div>
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
											options={{ disableAutoPan: true, ...getInfoWindowOptions(lat, lng, mapRef) }}
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
						const icon = priceIcon(marker.price, props.over.id === marker.id);
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
											const mls = detailed?.mls_number;
											if (mls) {
												prevUrlRef.current = window.location.href;
												window.history.replaceState(null, '', `/listing/${encodeURIComponent(mls)}`);
											}
										});
									}
								}}
								onMouseOver={() => !isMobile && setIsOpen({ openInfoWindowMarkerId: marker.id })}
								onMouseOut={() => !isMobile && setIsOpen({ openInfoWindowMarkerId: 0 })}
								zIndex={props.over.id === marker.id ? 9999 : 0}
							>
								{showInfo && (
										<InfoWindow
											onCloseClick={() => {
												setIsOpen({ openInfoWindowMarkerId: 0 });
												setIsOver({ id: 0 });
												props.onOverClear?.();
											}}
											options={{ disableAutoPan: true, ...getInfoWindowOptions(lat, lng, mapRef) }}
										>
										<PropertyPreviewList
											properties={[marker]}
											onSelect={handlePropertySelect}
										/>
									</InfoWindow>
								)}
								{showModal.show === marker.id && (
									<Modal onClose={() => {
										setShowModal({ show: 0 });
										if (prevUrlRef.current) {
											window.history.replaceState(null, '', prevUrlRef.current);
											prevUrlRef.current = null;
										}
									}}>
										<Property
											property={markerModalProperty || marker}
											onClose={() => {
												setShowModal({ show: 0 });
												setMarkerModalProperty(null);
												if (prevUrlRef.current) {
													window.history.replaceState(null, '', prevUrlRef.current);
													prevUrlRef.current = null;
												}
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
});

const MyMapLegacy = withScriptjs(MapCore);

const isProductionHost = () =>
	typeof window !== "undefined" &&
	(window.location.hostname === "tourit.ca" ||
		window.location.hostname === "www.tourit.ca");

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
			libraries: ["geometry", "places"],
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

	return <MapCore {...props} />;
};

const MyMap = (props) => {
	if (isProductionHost()) {
		return <ProductionMapLoader {...props} />;
	}
	return <MyMapLegacy {...props} />;
};

export default MyMap;
