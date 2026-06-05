from flask import Blueprint, request, jsonify
from ..utils.mailer import send_agent_signup_request

agent_lead_routes = Blueprint("agent_lead_routes", __name__)


@agent_lead_routes.route("", methods=["POST"])
def submit_agent_lead():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    if not email or "@" not in email or "." not in email.split("@")[-1]:
        return jsonify({"error": "Invalid email address"}), 400
    try:
        send_agent_signup_request(email)
    except Exception as e:
        print(f"[agent_lead] email send failed: {e}")
    return jsonify({"ok": True}), 200
