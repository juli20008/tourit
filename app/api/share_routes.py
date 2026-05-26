import json
import os
import re
from html import escape as html_escape
from urllib.parse import urlparse

from flask import Blueprint, redirect, request, Response

share_routes = Blueprint("share", __name__)


def _canonical_url(mls_number, agent_id, frontend_url, wl_slug=None):
    """Build the full listing URL, respecting whitelabel subdomains."""
    if agent_id:
        # Mirror the frontend's buildListingUrl logic:
        # in production, agents get https://{slug}.tourit.ca/listing/:mls
        try:
            from app.models.user import User
            agent = User.query.get(int(agent_id))
            if agent and agent.agent:
                slug = re.sub(r'[^a-zA-Z0-9]', '', agent.username or '').lower()
                if slug and 'tourit.ca' in frontend_url:
                    return f"https://{slug}.tourit.ca/listing/{mls_number}"
        except Exception:
            pass
        return f"{frontend_url}/a/{agent_id}/listing/{mls_number}"

    # Non-agent share from a whitelabel subdomain — stay on that domain
    if wl_slug:
        return f"https://{wl_slug}.tourit.ca/listing/{mls_number}"

    return f"{frontend_url}/listing/{mls_number}"


@share_routes.route("/proxy-image")
def proxy_image():
    import requests as http_client
    url = request.args.get("url", "").strip()
    if not url:
        return "", 400
    domain = urlparse(url).netloc.lower()
    _ALLOWED = ("supabase.co", "realtor.ca", "amazonaws.com", "cdn.realtor.ca", "googleusercontent.com")
    if not any(domain == d or domain.endswith("." + d) for d in _ALLOWED):
        return "", 403
    try:
        r = http_client.get(url, timeout=8, headers={"User-Agent": "Tourit/1.0"})
        if not r.ok:
            return "", 502
        ct = r.headers.get("Content-Type", "image/jpeg")
        if not ct.startswith("image/"):
            return "", 403
        resp = Response(r.content, content_type=ct)
        resp.headers["Access-Control-Allow-Origin"] = "*"
        resp.headers["Cache-Control"] = "public, max-age=3600"
        return resp
    except Exception:
        return "", 502


@share_routes.route("/listing/<string:mls_number>")
def share_listing(mls_number):
    from app.models.mls_listing import MlsListing

    frontend_url = os.environ.get("FRONTEND_URL", "https://tourit.ca")
    agent_id = request.args.get("agent", "").strip()
    wl_slug = re.sub(r'[^a-z0-9-]', '', request.args.get("wl", "").strip().lower()) or None

    canonical = _canonical_url(mls_number, agent_id, frontend_url, wl_slug)

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
  <meta http-equiv="refresh" content="0; url={url_esc}" />

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
    .page-link {{
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 100%;
      text-decoration: none;
      color: inherit;
      cursor: pointer;
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
  <a class="page-link" href="{url_esc}">
    {"<img class='photo' src='" + photo_esc + "' alt='Property photo' loading='eager' />" if photo_esc else "<div class='photo-placeholder'></div>"}
    <div class="card">
      <div class="price">{html_escape(price_fmt)}</div>
      {"<div class='addr'>" + html_escape(addr) + "</div>" if addr else ""}
      {"<div class='loc'>" + html_escape(loc_str) + "</div>" if loc_str else ""}
      {"<div class='specs'>" + spec_html + "</div>" if spec_html else ""}
      <span class="btn">View Full Listing →</span>
      <div class="brand">tourit.ca</div>
    </div>
  </a>
</body>
</html>"""

    return page, 200, {"Content-Type": "text/html; charset=utf-8"}
