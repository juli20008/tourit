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
    state  = d.get("state") or ""
    addr   = ", ".join(p for p in [f"Unit {unit}" if unit else None, street, city] if p)
    title  = f"{addr} — {price_fmt}" if addr else f"Property — {price_fmt}"

    specs_parts = []
    if d.get("bed"):  specs_parts.append(f"{d['bed']} bd")
    if d.get("bath"): specs_parts.append(f"{d['bath']} ba")
    if d.get("sqft"): specs_parts.append(f"{d['sqft']} sqft")
    specs = " · ".join(specs_parts) if specs_parts else ""
    description = specs if specs else "View this property on Tourit"

    images   = d.get("images") or []
    photo    = images[0] if images else ""
    og_image = photo or f"{frontend_url}/logo512.png"

    t        = html_escape(title)
    dsc      = html_escape(description)
    img_esc  = html_escape(og_image)
    url_esc  = html_escape(canonical)
    photo_esc = html_escape(photo)
    loc_str  = ", ".join(p for p in [city, state] if p)

    # Build specs row with icons
    spec_html_parts = []
    if d.get("bed"):
        spec_html_parts.append(f'<span>{d["bed"]} bd</span>')
    if d.get("bath"):
        spec_html_parts.append(f'<span>{d["bath"]} ba</span>')
    if d.get("sqft"):
        spec_html_parts.append(f'<span>{d["sqft"]} sqft</span>')
    spec_html = "  ·  ".join(spec_html_parts)

    page = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>{t}</title>
  <meta name="description" content="{dsc}" />

  <!-- ─── Open Graph (WeChat, Slack, iMessage …) ──────────────────────── -->
  <meta property="og:type"        content="website" />
  <meta property="og:url"         content="{url_esc}" />
  <meta property="og:title"       content="{t}" />
  <meta property="og:description" content="{dsc}" />
  <meta property="og:image"       content="{img_esc}" />
  <meta property="og:site_name"   content="Tourit" />

  <!-- ─── Twitter / XHS link card ─────────────────────────────────────── -->
  <meta name="twitter:card"        content="summary_large_image" />
  <meta name="twitter:title"       content="{t}" />
  <meta name="twitter:description" content="{dsc}" />
  <meta name="twitter:image"       content="{img_esc}" />

  <style>
    *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", Arial, sans-serif;
      background: #111110;
      color: #fff;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
    }}
    .photo {{
      width: 100%;
      max-height: 56vw;
      max-height: min(56vw, 380px);
      object-fit: cover;
      display: block;
      background: #1e1e1c;
    }}
    .photo-placeholder {{
      width: 100%;
      height: 200px;
      background: linear-gradient(135deg, #252523, #1a1a18);
    }}
    .card {{
      width: 100%;
      max-width: 480px;
      padding: 28px 24px 40px;
    }}
    .price {{
      font-size: 2rem;
      font-weight: 700;
      letter-spacing: -.5px;
      margin-bottom: 6px;
    }}
    .addr {{
      font-size: 1rem;
      color: #9a9a94;
      margin-bottom: 4px;
    }}
    .loc {{
      font-size: .85rem;
      color: #5a5a54;
      margin-bottom: 14px;
    }}
    .specs {{
      font-size: .9rem;
      color: #6b6b65;
      margin-bottom: 28px;
    }}
    .specs span + span::before {{
      content: "  ·  ";
      color: #3a3a34;
    }}
    .btn {{
      display: block;
      width: 100%;
      padding: 15px 0;
      background: #fff;
      color: #111110;
      font-size: .95rem;
      font-weight: 600;
      text-align: center;
      text-decoration: none;
      border-radius: 12px;
      letter-spacing: .01em;
    }}
    .brand {{
      margin-top: 20px;
      font-size: .75rem;
      color: #3a3a34;
      text-align: center;
    }}
  </style>
</head>
<body>
  {"<img class='photo' src='" + photo_esc + "' alt='Property photo' loading='eager' />" if photo_esc else "<div class='photo-placeholder'></div>"}
  <div class="card">
    <div class="price">{html_escape(price_fmt)}</div>
    {"<div class='addr'>" + html_escape(addr) + "</div>" if addr else ""}
    {"<div class='loc'>" + html_escape(loc_str) + "</div>" if loc_str else ""}
    {"<div class='specs'>" + spec_html + "</div>" if spec_html else ""}
    <a class="btn" href="{url_esc}">View Full Listing →</a>
    <div class="brand">tourit.ca</div>
  </div>
</body>
</html>"""

    return page, 200, {"Content-Type": "text/html; charset=utf-8"}
