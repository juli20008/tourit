import { useRef, useState, useEffect, useCallback } from "react";
import { X, Download, Link2, Share2 } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";

const fmtPrice = (p) =>
	"$" + (p ?? 0).toFixed(0).replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1,");

// Load image via backend proxy to avoid canvas CORS taint.
const loadImg = (url) =>
	new Promise((resolve) => {
		if (!url) return resolve({ img: null, tainted: false });
		const proxyUrl = `/share/proxy-image?url=${encodeURIComponent(url)}`;
		fetch(proxyUrl)
			.then((r) => (r.ok ? r.blob() : Promise.reject()))
			.then((blob) => {
				const blobUrl = URL.createObjectURL(blob);
				const img = new Image();
				img.onload = () => { URL.revokeObjectURL(blobUrl); resolve({ img, tainted: false }); };
				img.onerror = () => { URL.revokeObjectURL(blobUrl); resolve({ img: null, tainted: false }); };
				img.src = blobUrl;
			})
			.catch(() => resolve({ img: null, tainted: false }));
	});

const drawCard = async (canvas, property, qrCanvas = null) => {
	const W = 1080, H = 1440;
	canvas.width  = W;
	canvas.height = H;
	const ctx = canvas.getContext("2d");

	const PHOTO_H = Math.round(H * 0.62);
	const INFO_Y  = PHOTO_H;
	const INFO_H  = H - PHOTO_H;
	const PAD     = 72;

	// ── Photo section ──────────────────────────────────────────────────────
	const photoUrl = (property.images || property.image_urls || [])[0]
		|| property.front_img || property.image_url;
	let tainted = false;

	if (photoUrl) {
		const { img, tainted: t } = await loadImg(photoUrl);
		if (img) {
			tainted = t;
			// Object-fit: cover — fill the photo area without stretching
			const scale = Math.max(W / img.naturalWidth, PHOTO_H / img.naturalHeight);
			const dw = img.naturalWidth  * scale;
			const dh = img.naturalHeight * scale;
			const dx = (W - dw) / 2;
			const dy = (PHOTO_H - dh) / 2;
			ctx.save();
			ctx.rect(0, 0, W, PHOTO_H);
			ctx.clip();
			ctx.drawImage(img, dx, dy, dw, dh);
			ctx.restore();
		} else {
			_drawPhotoPlaceholder(ctx, W, PHOTO_H);
		}
	} else {
		_drawPhotoPlaceholder(ctx, W, PHOTO_H);
	}

	// Gradient fade at the bottom of the photo
	const fade = ctx.createLinearGradient(0, PHOTO_H - 300, 0, PHOTO_H);
	fade.addColorStop(0, "rgba(0,0,0,0)");
	fade.addColorStop(1, "rgba(0,0,0,0.7)");
	ctx.fillStyle = fade;
	ctx.fillRect(0, PHOTO_H - 300, W, 300);

	// ── Info section ───────────────────────────────────────────────────────
	ctx.fillStyle = "#1a1a18";
	ctx.fillRect(0, INFO_Y, W, INFO_H);

	// Hairline separator
	ctx.strokeStyle = "rgba(255,255,255,0.07)";
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.moveTo(PAD, INFO_Y); ctx.lineTo(W - PAD, INFO_Y);
	ctx.stroke();

	let ty = INFO_Y + 90;
	ctx.textBaseline = "alphabetic";

	// Price
	ctx.fillStyle = "#ffffff";
	ctx.font = `bold 90px -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif`;
	ctx.fillText(fmtPrice(property.price), PAD, ty);
	ty += 108;

	// Address (truncate if too long)
	const addr = [
		property.unit && `Unit ${property.unit}`,
		property.street,
		property.city,
	].filter(Boolean).join(", ");

	if (addr) {
		ctx.fillStyle = "#9a9a94";
		ctx.font = `50px -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif`;
		const maxW = W - PAD * 2;
		let text = addr;
		while (ctx.measureText(text).width > maxW && text.length > 10) {
			text = text.slice(0, -1);
		}
		ctx.fillText(text !== addr ? text.trimEnd() + "…" : text, PAD, ty);
		ty += 72;
	}

	// Beds · baths · sqft
	const specs = [
		property.bed  && `${property.bed} bd`,
		property.bath && `${property.bath} ba`,
		property.sqft && `${property.sqft} sqft`,
	].filter(Boolean).join("  ·  ");

	if (specs) {
		ctx.fillStyle = "#5a5a54";
		ctx.font = `46px -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif`;
		ctx.fillText(specs, PAD, ty);
	}

	// QR code — bottom left
	if (qrCanvas) {
		const QR_SIZE = 180;
		const BG_PAD  = 14;
		const QR_X    = PAD;
		const QR_Y    = H - PAD - QR_SIZE;
		ctx.fillStyle = "#ffffff";
		ctx.fillRect(QR_X - BG_PAD, QR_Y - BG_PAD, QR_SIZE + BG_PAD * 2, QR_SIZE + BG_PAD * 2);
		ctx.drawImage(qrCanvas, QR_X, QR_Y, QR_SIZE, QR_SIZE);
	}

	// Brand watermark — bottom right
	ctx.fillStyle = "#3a3a34";
	ctx.font = `40px -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif`;
	ctx.textAlign = "right";
	ctx.fillText("tourit.ca", W - PAD, H - PAD);
	ctx.textAlign = "left";

	return { tainted };
};

function _drawPhotoPlaceholder(ctx, W, H) {
	const g = ctx.createLinearGradient(0, 0, W, H);
	g.addColorStop(0, "#252523");
	g.addColorStop(1, "#1a1a18");
	ctx.fillStyle = g;
	ctx.fillRect(0, 0, W, H);
}

// ─────────────────────────────────────────────────────────────────────────────

const ShareModal = ({ property, shareUrl, onClose }) => {
	const canvasRef  = useRef(null);
	const qrCanvasRef = useRef(null);
	const [status, setStatus]   = useState("generating"); // generating | ready | tainted
	const [copied, setCopied]   = useState(false);
	const copyTimer = useRef(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas || !property) return;
		setStatus("generating");
		drawCard(canvas, property, qrCanvasRef.current).then(({ tainted }) =>
			setStatus(tainted ? "tainted" : "ready")
		);
	}, [property, shareUrl]);

	const handleSave = useCallback(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		try {
			const link = document.createElement("a");
			link.download = `tourit-${property?.mls_number || "listing"}.jpg`;
			link.href = canvas.toDataURL("image/jpeg", 0.92);
			link.click();
		} catch {
			// Canvas tainted — ask user to long-press
			setStatus("tainted");
		}
	}, [property]);

	const handleCopy = useCallback(() => {
		navigator.clipboard.writeText(shareUrl).catch(() => {});
		setCopied(true);
		clearTimeout(copyTimer.current);
		copyTimer.current = setTimeout(() => setCopied(false), 2500);
	}, [shareUrl]);

	const handleNativeShare = useCallback(async () => {
		if (!navigator.share) return;
		try {
			await navigator.share({
				title: `${fmtPrice(property?.price)} — ${property?.street || ""}, ${property?.city || ""}`,
				url:   shareUrl,
			});
		} catch {}
	}, [property, shareUrl]);

	const canNativeShare = typeof navigator !== "undefined" && !!navigator.share;

	return (
		<div
			className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60"
			onClick={onClose}
		>
			{/* Hidden QR canvas — composited onto the card by drawCard() */}
			<div style={{ position: "absolute", left: -9999, top: -9999, visibility: "hidden" }}>
				<QRCodeCanvas
					ref={qrCanvasRef}
					value={shareUrl}
					size={300}
					bgColor="#ffffff"
					fgColor="#111110"
					level="M"
				/>
			</div>
			<div
				className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-[360px] sm:mx-4"
				onClick={(e) => e.stopPropagation()}
			>
				{/* Header */}
				<div className="flex items-center justify-between px-5 pt-5 pb-3">
					<span className="text-sm font-semibold text-[#0f172a]">分享房源 / Share</span>
					<button
						onClick={onClose}
						className="flex items-center justify-center w-7 h-7 rounded-full bg-[#f1f5f9] text-gray-500 hover:bg-[#e2e8f0] transition-colors"
					>
						<X size={13} strokeWidth={2} />
					</button>
				</div>

				{/* Card preview */}
				<div className="px-5 pb-3">
					<div className="relative rounded-xl overflow-hidden bg-[#1a1a18] aspect-[3/4]">
						{status === "generating" && (
							<div className="absolute inset-0 flex items-center justify-center text-xs text-[#9a9a94]">
								生成中…
							</div>
						)}
						{/* Full-res canvas displayed at CSS size */}
						<canvas
							ref={canvasRef}
							className="w-full h-auto block"
							style={{ display: status === "generating" ? "none" : "block" }}
						/>
						{status === "tainted" && (
							<div className="absolute bottom-0 left-0 right-0 bg-black/70 py-2 text-center text-[11px] text-white">
								长按图片保存 / Long-press to save
							</div>
						)}
					</div>

					<p className="text-[11px] text-[#94a3b8] mt-2 text-center leading-snug">
						保存图片 → 发至小红书 &nbsp;·&nbsp; 复制链接 → 转发微信
					</p>
				</div>

				{/* Buttons */}
				<div className={`px-5 pb-6 grid gap-3 ${canNativeShare ? "grid-cols-3" : "grid-cols-2"}`}>
					<button
						onClick={handleSave}
						disabled={status === "generating"}
						className="flex flex-col items-center justify-center gap-1.5 rounded-xl bg-[#0f172a] py-3.5 text-white disabled:opacity-40 transition-opacity active:opacity-70"
					>
						<Download size={17} strokeWidth={2} />
						<span className="text-[11px] font-semibold">Save Card</span>
					</button>

					<button
						onClick={handleCopy}
						className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-[#e2e8f0] py-3.5 text-[#0f172a] active:bg-[#f8fafc] transition-colors"
					>
						<Link2 size={17} strokeWidth={2} />
						<span className="text-[11px] font-semibold">
							{copied ? "✓ Copied!" : "Copy Link"}
						</span>
					</button>

					{canNativeShare && (
						<button
							onClick={handleNativeShare}
							className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-[#e2e8f0] py-3.5 text-[#0f172a] active:bg-[#f8fafc] transition-colors"
						>
							<Share2 size={17} strokeWidth={2} />
							<span className="text-[11px] font-semibold">More</span>
						</button>
					)}
				</div>
			</div>
		</div>
	);
};

export default ShareModal;
