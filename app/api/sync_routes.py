import os
from flask import Blueprint, jsonify, request
from ..services.repliers_sync import sync_listings

sync_routes = Blueprint('sync', __name__)

_SYNC_SECRET = os.environ.get("SYNC_SECRET", "")


@sync_routes.route("/listings", methods=["POST"])
def trigger_sync():
    """Called by Render Cron Job every 12 hours to refresh MLS listings."""
    token = request.headers.get("X-Sync-Token", "")
    if not _SYNC_SECRET or token != _SYNC_SECRET:
        return jsonify({"error": "Unauthorized"}), 401

    try:
        count = sync_listings(verbose=False)
        return jsonify({"ok": True, "upserted": count})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500
