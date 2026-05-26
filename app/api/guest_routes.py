import threading
from datetime import datetime, timezone
from flask import Blueprint, request
from app.models import db, User, Channel, Chat
from app.models.guest_booking import GuestBooking
from app.utils.mailer import send_guest_booking_alert, send_guest_lead_captured
from app.socket import socketio

guest_routes = Blueprint("guest", __name__)

_GUEST_DOMAIN = "tourit.guest"


def _get_agent():
    from app.utils.availability import _fallback_agent
    return _fallback_agent()


def _guest_email(guest_id):
    return f"guest_{guest_id[:24]}@{_GUEST_DOMAIN}"


def _get_or_create_guest_user(guest_id):
    email = _guest_email(guest_id)
    user = User.query.filter_by(email=email).first()
    if user:
        return user
    user = User(username="Guest", email=email, hashed_password=None, agent=False)
    db.session.add(user)
    db.session.flush()
    return user


def _get_or_create_channel(guest_user_id, agent_id):
    channel = Channel.query.filter_by(user_id=guest_user_id, agent_id=agent_id).first()
    if channel:
        return channel
    channel = Channel(user_id=guest_user_id, agent_id=agent_id)
    db.session.add(channel)
    db.session.flush()
    return channel


def _insert_chat(channel_id, user_id, text):
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    chat = Chat(channel_id=channel_id, user_id=user_id, message=text, created_at=now)
    db.session.add(chat)
    db.session.flush()
    return chat


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

    agent = _get_agent()
    if not agent:
        return {"errors": ["No agent configured"]}, 500

    chat_obj      = None
    channel_id    = None
    guest_user_id = None
    is_new        = False

    try:
        guest_user    = _get_or_create_guest_user(guest_id)
        guest_user_id = guest_user.id
        channel       = _get_or_create_channel(guest_user.id, agent.id)
        channel_id    = channel.id

        # Chat message that appears in Julie's dashboard
        msg = f"Hi! I'd like to book a showing.\n\U0001f4cd {address}\n\U0001f4c5 {date} at {time_str}"
        chat_obj = _insert_chat(channel.id, guest_user.id, msg)

        # Upsert guest_bookings
        existing = GuestBooking.query.filter_by(guest_id=guest_id).first()
        if existing:
            existing.date             = date
            existing.time             = time_str
            existing.property_address = address
            if image:
                existing.property_image = image
            if mls_number:
                existing.mls_number = mls_number
        else:
            is_new = True
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

        # Emit to whoever is viewing this channel AND to the agent's personal room.
        # The agent-room payload includes _channel so the frontend can add the
        # channel to Redux immediately without a separate HTTP round-trip.
        chat_payload = chat_obj.to_dict()
        socketio.emit("chat", chat_payload, to=str(channel.id))
        try:
            channel_dict = channel.to_dict()
        except Exception:
            channel_dict = None
        agent_payload = {**chat_payload, **({"_channel": channel_dict} if channel_dict else {})}
        socketio.emit("chat", agent_payload, to=f"agent_{agent.id}")

    except Exception as e:
        db.session.rollback()
        import traceback; traceback.print_exc()
        return {"errors": [str(e)]}, 500

    if is_new:
        threading.Thread(
            target=send_guest_booking_alert,
            args=(address, date, time_str, guest_id),
            daemon=True,
        ).start()

    return {"ok": True, "channel_id": channel_id, "guest_user_id": guest_user_id}


@guest_routes.route("/contact", methods=["POST"])
def capture_guest_contact():
    payload  = request.get_json(silent=True) or {}
    guest_id = (payload.get("guest_id") or "").strip()
    phone    = (payload.get("phone") or "").strip()
    email    = (payload.get("email") or "").strip()

    if not guest_id or (not phone and not email):
        return {"errors": ["guest_id and at least phone or email are required"]}, 400

    agent = _get_agent()
    chat_obj   = None
    channel_id = None

    try:
        guest_user = User.query.filter_by(email=_guest_email(guest_id)).first()
        if guest_user and agent:
            # Give the ghost user a recognizable name so Julie's dashboard is readable
            if guest_user.username == "Guest":
                display = phone or email
                # VARCHAR(40): "Guest (" = 7 chars + ")" = 1 char → 32 chars for contact
                guest_user.username = f"Guest ({display[:32]})"

            channel = Channel.query.filter_by(user_id=guest_user.id, agent_id=agent.id).first()
            if channel:
                channel_id = channel.id
                parts = []
                if phone: parts.append(f"\U0001f4f1 {phone}")
                if email: parts.append(f"✉️ {email}")
                chat_obj = _insert_chat(channel.id, guest_user.id, "My contact info: " + "  ".join(parts))

        # Update booking record
        booking = GuestBooking.query.filter_by(guest_id=guest_id).first()
        if not booking:
            booking = GuestBooking(
                guest_id="", property_address="Unknown", date="", time="", status="lead"
            )
            db.session.add(booking)

        booking.phone  = phone or booking.phone
        booking.email  = email or booking.email
        booking.status = "lead"
        db.session.commit()

        if chat_obj and channel_id:
            payload = chat_obj.to_dict()
            socketio.emit("chat", payload, to=str(channel_id))
            socketio.emit("chat", payload, to=f"agent_{agent.id}")

    except Exception as e:
        db.session.rollback()
        import traceback; traceback.print_exc()
        return {"errors": [str(e)]}, 500

    threading.Thread(
        target=send_guest_lead_captured,
        args=(
            booking.property_address if booking else "Unknown",
            booking.date if booking else "",
            booking.time if booking else "",
            phone, email,
        ),
        daemon=True,
    ).start()

    return {"ok": True}


@guest_routes.route("/message", methods=["POST"])
def send_guest_message():
    payload  = request.get_json(silent=True) or {}
    guest_id = (payload.get("guest_id") or "").strip()
    text     = (payload.get("text") or "").strip()

    if not guest_id or not text:
        return {"errors": ["guest_id and text are required"]}, 400

    agent = _get_agent()
    if not agent:
        return {"errors": ["No agent configured"]}, 500

    try:
        guest_user = User.query.filter_by(email=_guest_email(guest_id)).first()
        if not guest_user:
            guest_user = _get_or_create_guest_user(guest_id)

        channel = _get_or_create_channel(guest_user.id, agent.id)
        chat_obj = _insert_chat(channel.id, guest_user.id, text)
        db.session.commit()
        payload = chat_obj.to_dict()
        socketio.emit("chat", payload, to=str(channel.id))
        socketio.emit("chat", payload, to=f"agent_{agent.id}")
    except Exception as e:
        db.session.rollback()
        import traceback; traceback.print_exc()
        return {"errors": [str(e)]}, 500

    return {"ok": True}
