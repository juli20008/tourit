import threading
from flask import Blueprint, request
from app.models import db
from app.models.guest_booking import GuestBooking
from app.utils.mailer import send_guest_booking_alert, send_guest_lead_captured

guest_routes = Blueprint("guest", __name__)


@guest_routes.route("/book", methods=["POST"])
def create_guest_booking():
    payload    = request.get_json(silent=True) or {}
    guest_id   = (payload.get("guest_id") or "").strip()
    date       = (payload.get("date") or "").strip()
    time_str   = (payload.get("time") or "").strip()
    address    = (payload.get("address") or "").strip()
    image      = (payload.get("image") or "").strip()
    mls_number = payload.get("mls_number") or None

    if not guest_id or not date or not time_str or not address:
        return {"errors": ["guest_id, date, time, and address are required"]}, 400

    # Upsert — one active booking per guest session
    existing = GuestBooking.query.filter_by(guest_id=guest_id).first()
    if existing:
        existing.date             = date
        existing.time             = time_str
        existing.property_address = address
        if image:
            existing.property_image = image
        if mls_number:
            existing.mls_number = mls_number
        db.session.commit()
        return {"ok": True, "booking_id": existing.id}

    booking = GuestBooking(
        guest_id         = guest_id,
        property_address = address,
        property_image   = image or None,
        mls_number       = mls_number,
        date             = date,
        time             = time_str,
        status           = "pending",
    )
    db.session.add(booking)
    db.session.commit()

    # Fire-and-forget — don't block the response
    threading.Thread(
        target=send_guest_booking_alert,
        args=(address, date, time_str, guest_id),
        daemon=True,
    ).start()

    return {"ok": True, "booking_id": booking.id}


@guest_routes.route("/contact", methods=["POST"])
def capture_guest_contact():
    payload  = request.get_json(silent=True) or {}
    guest_id = (payload.get("guest_id") or "").strip()
    phone    = (payload.get("phone") or "").strip()
    email    = (payload.get("email") or "").strip()

    if not guest_id or (not phone and not email):
        return {"errors": ["guest_id and at least phone or email are required"]}, 400

    booking = GuestBooking.query.filter_by(guest_id=guest_id).first()
    if not booking:
        # Create a minimal record so the lead isn't lost even if /book was missed
        booking = GuestBooking(
            guest_id         = guest_id,
            property_address = "Unknown",
            date             = "",
            time             = "",
            status           = "lead",
        )
        db.session.add(booking)

    booking.phone  = phone or booking.phone
    booking.email  = email or booking.email
    booking.status = "lead"
    db.session.commit()

    threading.Thread(
        target=send_guest_lead_captured,
        args=(booking.property_address, booking.date, booking.time, phone, email),
        daemon=True,
    ).start()

    return {"ok": True}
