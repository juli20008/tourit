import json
import os
from html import escape as html_escape

from flask import Blueprint, redirect, request

share_routes = Blueprint("share", __name__)


@share_routes.route("/listing/<string:mls_number>")
def share_listing(mls_number):
    from app.models.mls_listing import MlsListing

    frontend_url = os.environ.get("FRONTEND_URL", "https://tourit.ca")
    agent_id = request.args.get("agent", "").strip()

    canonical = (
        f"{frontend_url}/a/{agent_id}/listing/{mls_number}"
        if agent_id
        else f"{frontend_url}/listing/{mls_number}"
    )

    listing = MlsListing.query.filter_by(mls_number=mls_number).first()
    if not listing:
        return redirect(canonical)

    try:
        d = listing._base_frontend_dict()
    except Exception:
        return redirect(canonical)

    price = d.get("price") or 0
    try:
        price_fmt = "$" + f"{float(price):,.0f}"
    except Exception:
        price_fmt = ""

    unit   = d.get("unit") or ""
    street = d.get("street") or ""
    city   = d.get("city") or ""
    addr   = ", ".join(p for p in [f"Unit {unit}" if unit else None, street, city] if p)
    title  = f"{addr} — {price_fmt}" if addr else f"Property — {price_fmt}"

    specs = []
    if d.get("bed"):  specs.append(f"{d['bed']} bd")
    if d.get("bath"): specs.append(f"{d['bath']} ba")
    if d.get("sqft"): specs.append(f"{d['sqft']} sqft")
    description = " · ".join(specs) if specs else "View this property on Tourit"

    images   = d.get("images") or []
    og_image = images[0] if images else f"{frontend_url}/logo512.png"

    t   = html_escape(title)
    dsc = html_escape(description)
    img = html_escape(og_image)
    url = html_escape(canonical)

    page = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>{t}</title>
  <meta name="description" content="{dsc}" />

  <!-- Open Graph — WeChat, Slack, iMessage, LINE … -->
  <meta property="og:type"        content="website" />
  <meta property="og:url"         content="{url}" />
  <meta property="og:title"       content="{t}" />
  <meta property="og:description" content="{dsc}" />
  <meta property="og:image"       content="{img}" />
  <meta property="og:site_name"   content="Tourit" />

  <!-- Twitter / XHS link card -->
  <meta name="twitter:card"        content="summary_large_image" />
  <meta name="twitter:title"       content="{t}" />
  <meta name="twitter:description" content="{dsc}" />
  <meta name="twitter:image"       content="{img}" />

  <!-- Redirect real browsers to the listing page; crawlers stop here -->
  <script>window.location.replace({json.dumps(canonical)});</script>
</head>
<body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#f9f9f7;color:#1a1a18;padding:3rem 2rem;">
  <p style="font-size:1.2rem;font-weight:600;margin:0 0 .4rem">{t}</p>
  <p style="font-size:.95rem;color:#6b6b65;margin:0 0 1.5rem">{dsc}</p>
  <a href="{url}" style="color:#0f172a;font-weight:500;text-decoration:none;border-bottom:1px solid currentColor">View listing →</a>
</body>
</html>"""

    return page, 200, {"Content-Type": "text/html; charset=utf-8"}
