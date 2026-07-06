import os
import datetime
import requests
from flask import Blueprint, request, jsonify
from flask_cors import cross_origin
from sqlalchemy import text
from app.models import db

xhs_routes = Blueprint('xhs', __name__)

FREE_LIMIT = 5  # free uses per device per month


def _current_month():
    return datetime.datetime.utcnow().strftime('%Y-%m')


def _maybe_reset(row, device_id, month):
    if row.get('reset_month') == month:
        return row
    try:
        db.session.execute(
            text("UPDATE xhs_credits SET free_used=0, reset_month=:m WHERE device_id=:d"),
            {'m': month, 'd': device_id}
        )
        db.session.commit()
    except Exception:
        db.session.rollback()
    row = dict(row)
    row['free_used'] = 0
    row['reset_month'] = month
    return row


def _get_or_create_credits(device_id):
    """Return {free_used, paid_credits, reset_month} row, creating/resetting if needed."""
    month = _current_month()
    row = db.session.execute(
        text("SELECT free_used, paid_credits, reset_month FROM xhs_credits WHERE device_id=:d"),
        {'d': device_id}
    ).mappings().first()

    if row:
        return _maybe_reset(dict(row), device_id, month)

    try:
        db.session.execute(
            text("""INSERT INTO xhs_credits (device_id, free_used, paid_credits, reset_month)
                    VALUES (:d, 0, 0, :m) ON CONFLICT (device_id) DO NOTHING"""),
            {'d': device_id, 'm': month}
        )
        db.session.commit()
    except Exception:
        db.session.rollback()

    row = db.session.execute(
        text("SELECT free_used, paid_credits, reset_month FROM xhs_credits WHERE device_id=:d"),
        {'d': device_id}
    ).mappings().first()

    if row:
        return _maybe_reset(dict(row), device_id, month)
    return {'free_used': 0, 'paid_credits': 0, 'reset_month': month}


def _deduct_credit(device_id, row):
    if row['free_used'] < FREE_LIMIT:
        patch = {'col': 'free_used', 'val': row['free_used'] + 1}
    elif row['paid_credits'] > 0:
        patch = {'col': 'paid_credits', 'val': row['paid_credits'] - 1}
    else:
        return False
    try:
        db.session.execute(
            text(f"UPDATE xhs_credits SET {patch['col']}=:v WHERE device_id=:d"),
            {'v': patch['val'], 'd': device_id}
        )
        db.session.commit()
        return True
    except Exception:
        db.session.rollback()
        return False


def _add_paid_credits(device_id, qty):
    row = _get_or_create_credits(device_id)
    try:
        db.session.execute(
            text("UPDATE xhs_credits SET paid_credits=:v WHERE device_id=:d"),
            {'v': row['paid_credits'] + qty, 'd': device_id}
        )
        db.session.commit()
        return True
    except Exception:
        db.session.rollback()
        return False


# ── PayPal helpers ─────────────────────────────────────────────────────────────

def _paypal_base():
    mode = os.environ.get('PAYPAL_MODE', 'live')
    return 'https://api-m.sandbox.paypal.com' if mode == 'sandbox' else 'https://api-m.paypal.com'


def _paypal_access_token():
    r = requests.post(
        f'{_paypal_base()}/v1/oauth2/token',
        auth=(os.environ.get('PAYPAL_CLIENT_ID', ''), os.environ.get('PAYPAL_CLIENT_SECRET', '')),
        data={'grant_type': 'client_credentials'},
        timeout=10,
    )
    if not r.ok:
        raise RuntimeError(f'PayPal auth failed {r.status_code}: {r.text[:200]}')
    return r.json()['access_token']


def _html_page(title, body, error=False):
    color = '#dc2626' if error else '#16a34a'
    return f'''<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8" />
  <title>{title} — Tourit</title>
  <style>
    body{{font-family:system-ui,sans-serif;display:flex;align-items:center;
         justify-content:center;min-height:100vh;margin:0;background:#f8fafc}}
    .card{{background:#fff;border-radius:16px;padding:40px 48px;
           box-shadow:0 8px 32px rgba(0,0,0,.12);text-align:center;max-width:440px}}
    h1{{color:{color};font-size:22px;margin:0 0 14px}}
    p{{color:#64748b;font-size:15px;line-height:1.7;margin:0}}
  </style>
</head>
<body>
  <div class="card"><h1>{title}</h1><p>{body}</p></div>
</body>
</html>'''


# ── Routes ─────────────────────────────────────────────────────────────────────

@xhs_routes.route('/credits', methods=['GET', 'OPTIONS'])
@cross_origin(origins='*')
def get_credits():
    if request.method == 'OPTIONS':
        return '', 204
    device_id = request.args.get('device_id', '').strip()
    if not device_id:
        return jsonify({'error': 'device_id required'}), 400
    try:
        row = _get_or_create_credits(device_id)
        return jsonify({
            'free_used':   row['free_used'],
            'free_total':  FREE_LIMIT,
            'paid_credits': row['paid_credits'],
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@xhs_routes.route('/checkout/create', methods=['POST', 'OPTIONS'])
@cross_origin(origins='*')
def checkout_create():
    if request.method == 'OPTIONS':
        return '', 204
    if not os.environ.get('PAYPAL_CLIENT_ID') or not os.environ.get('PAYPAL_CLIENT_SECRET'):
        return jsonify({'error': 'PayPal not configured'}), 503

    data = request.get_json(silent=True) or {}
    device_id = data.get('device_id', '').strip()
    quantity  = max(1, min(50, int(data.get('quantity', 10))))
    if not device_id:
        return jsonify({'error': 'device_id required'}), 400

    try:
        token    = _paypal_access_token()
        api_base = os.environ.get('API_BASE_URL', 'https://api.tourit.ca')
        r = requests.post(
            f'{_paypal_base()}/v2/checkout/orders',
            headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
            json={
                'intent': 'CAPTURE',
                'purchase_units': [{
                    'amount': {'currency_code': 'CAD', 'value': str(quantity)},
                    'description': f'Tourit XHS 发布次数 ×{quantity}',
                }],
                'application_context': {
                    'return_url':  f'{api_base}/api/xhs/checkout/return?device_id={device_id}&quantity={quantity}',
                    'cancel_url':  f'{api_base}/api/xhs/checkout/cancel',
                    'brand_name':  'Tourit',
                    'landing_page': 'BILLING',
                    'user_action': 'PAY_NOW',
                },
            },
            timeout=15,
        )
        if not r.ok:
            return jsonify({'error': f'PayPal order creation failed: {r.status_code}'}), 502

        order       = r.json()
        approve_url = next((l['href'] for l in order.get('links', []) if l['rel'] == 'approve'), None)
        if not approve_url:
            return jsonify({'error': 'No approval URL returned by PayPal'}), 502

        return jsonify({'approve_url': approve_url, 'order_id': order['id']})

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@xhs_routes.route('/checkout/return', methods=['GET'])
def checkout_return():
    """PayPal redirects the browser here after the user approves payment."""
    order_token = request.args.get('token', '')
    device_id   = request.args.get('device_id', '').strip()
    quantity    = max(1, int(request.args.get('quantity', 10)))

    if not order_token or not device_id:
        return _html_page('❌ 参数缺失', '付款参数不完整，请重试。', error=True)

    try:
        access_token = _paypal_access_token()
        r = requests.post(
            f'{_paypal_base()}/v2/checkout/orders/{order_token}/capture',
            headers={'Authorization': f'Bearer {access_token}', 'Content-Type': 'application/json'},
            timeout=15,
        )
        if not r.ok:
            return _html_page('❌ 付款捕获失败', f'PayPal 返回 {r.status_code}，请联系客服处理。', error=True)

        if r.json().get('status') != 'COMPLETED':
            return _html_page('❌ 付款未完成', f'订单状态：{r.json().get("status")}，请联系客服。', error=True)

        ok = _add_paid_credits(device_id, quantity)
        if not ok:
            return _html_page(
                '⚠ 付款成功，但积分添加失败',
                '请截图此页面并通过 tourit.ca 联系客服手动补充额度。',
                error=True,
            )

        return _html_page(
            '✅ 充值成功！',
            f'已为您添加 <strong>{quantity} 次</strong> AI 发布额度。<br>'
            f'请关闭此标签页并返回 Chrome 插件，点击「↻ 刷新额度」即可继续使用。',
        )

    except Exception as e:
        return _html_page('❌ 服务器错误', str(e), error=True)


@xhs_routes.route('/checkout/cancel', methods=['GET'])
def checkout_cancel():
    return _html_page('付款已取消', '您已取消付款。关闭此标签页后，可在插件弹窗中重新发起充值。')


# ── Agent voice + video routes (login required) ────────────────────────────────

@xhs_routes.route('/agent/voice', methods=['POST'])
def upload_agent_voice():
    """Upload a voice sample and create a MiniMax voice clone (one-time per agent)."""
    from flask_login import current_user, login_required
    from app.models import User, db
    from app.services.elevenlabs_service import create_voice_clone, delete_voice

    if not current_user.is_authenticated:
        return jsonify({'error': 'Unauthorized'}), 401
    if not current_user.agent:
        return jsonify({'error': 'Agent account required'}), 403

    if 'audio' not in request.files:
        return jsonify({'error': 'audio file required'}), 400

    audio_file = request.files['audio']
    audio_bytes = audio_file.read()
    if len(audio_bytes) < 1000:
        return jsonify({'error': 'Audio too short'}), 400

    content_type = audio_file.content_type or 'audio/webm'

    # 1. Store voice sample in R2
    import uuid
    from app.s3_helpers import _upload_bytes
    filename = f"voice-samples/{uuid.uuid4().hex}.webm"
    voice_sample_url = None
    try:
        voice_sample_url = _upload_bytes(audio_bytes, filename, content_type)
    except Exception:
        pass

    # 2. Delete old voice clone if exists
    user = User.query.get(current_user.id)
    if user.elevenlabs_voice_id:
        delete_voice(user.elevenlabs_voice_id)

    # 3. Create new voice clone
    try:
        voice_id = create_voice_clone(
            name=f"tourit_{user.id}_{user.username[:20]}",
            audio_bytes=audio_bytes,
            content_type=content_type,
        )
    except RuntimeError as e:
        return jsonify({'error': str(e)}), 502

    user.elevenlabs_voice_id = voice_id
    if voice_sample_url:
        user.voice_sample_url = voice_sample_url
    db.session.commit()

    return jsonify({'has_voice': True, 'voice_sample_url': voice_sample_url})


@xhs_routes.route('/agent/voice', methods=['DELETE'])
def delete_agent_voice():
    """Remove the agent's voice clone."""
    from flask_login import current_user
    from app.models import User, db
    from app.services.elevenlabs_service import delete_voice

    if not current_user.is_authenticated:
        return jsonify({'error': 'Unauthorized'}), 401

    user = User.query.get(current_user.id)
    if user.elevenlabs_voice_id:
        delete_voice(user.elevenlabs_voice_id)
        user.elevenlabs_voice_id = None
        user.voice_sample_url = None
        db.session.commit()

    return jsonify({'has_voice': False})




@xhs_routes.route('/agent/bg-music', methods=['POST'])
def upload_bg_music():
    """Upload background music for the agent's videos (stored in R2)."""
    from flask_login import current_user
    from app.models import db
    from app.models.user import User
    from app.s3_helpers import _upload_bytes

    if not current_user.is_authenticated:
        return jsonify({'error': 'Unauthorized'}), 401

    audio_file = request.files.get('music')
    if not audio_file:
        return jsonify({'error': 'No file provided'}), 400

    audio_bytes = audio_file.read()
    content_type = audio_file.content_type or 'audio/mpeg'
    ext = audio_file.filename.rsplit('.', 1)[-1].lower() if '.' in (audio_file.filename or '') else 'mp3'
    if ext not in {'mp3', 'wav', 'm4a', 'aac', 'ogg'}:
        ext = 'mp3'

    key = f"bg-music/{uuid.uuid4().hex}.{ext}"
    music_url = _upload_bytes(audio_bytes, key, content_type)

    user = User.query.get(current_user.id)
    user.bg_music_url = music_url
    db.session.commit()

    return jsonify({'bg_music_url': music_url})


@xhs_routes.route('/agent/bg-music', methods=['DELETE'])
def delete_bg_music():
    """Remove the agent's background music."""
    from flask_login import current_user
    from app.models import db
    from app.models.user import User

    if not current_user.is_authenticated:
        return jsonify({'error': 'Unauthorized'}), 401

    user = User.query.get(current_user.id)
    user.bg_music_url = None
    db.session.commit()
    return jsonify({'bg_music_url': None})


@xhs_routes.route('/agent/videos', methods=['GET'])
def get_agent_videos():
    """Return all non-expired XHS videos for the current agent."""
    from flask_login import current_user
    import datetime

    if not current_user.is_authenticated:
        return jsonify({'error': 'Unauthorized'}), 401

    try:
        rows = db.session.execute(
            text("""SELECT id, mls_number, video_url, cover1, cover2, cover3, created_at, expires_at
                    FROM xhs_videos
                    WHERE agent_id=:aid AND expires_at > NOW()
                    ORDER BY created_at DESC"""),
            {'aid': current_user.id}
        ).mappings().all()
        result = []
        for r in rows:
            row = dict(r)
            for k in ('created_at', 'expires_at'):
                if row.get(k) and hasattr(row[k], 'isoformat'):
                    row[k] = row[k].isoformat()
            result.append(row)
        return jsonify(result)
    except Exception:
        return jsonify([])


@xhs_routes.route('/listing-videos', methods=['POST'])
@cross_origin()
def get_listing_videos():
    """Batch: given {mls_numbers:[...]} return {mls_number: video_url} for those with active videos."""
    data = request.get_json(silent=True) or {}
    mls_list = [str(m) for m in (data.get('mls_numbers') or [])[:200]]
    if not mls_list:
        return jsonify({})
    try:
        rows = db.session.execute(
            text("""SELECT DISTINCT ON (mls_number) mls_number, video_url
                    FROM xhs_videos
                    WHERE mls_number = ANY(:mls) AND expires_at > NOW()
                    ORDER BY mls_number, created_at DESC"""),
            {'mls': mls_list}
        ).mappings().all()
        return jsonify({r['mls_number']: r['video_url'] for r in rows})
    except Exception:
        return jsonify({})


@xhs_routes.route('/listing-video/<mls_number>', methods=['GET'])
@cross_origin()
def get_listing_video(mls_number):
    """Most recent non-expired video for a listing. Public — no auth required."""
    try:
        row = db.session.execute(
            text("""SELECT video_url FROM xhs_videos
                    WHERE mls_number=:mls AND expires_at > NOW()
                    ORDER BY created_at DESC LIMIT 1"""),
            {'mls': mls_number}
        ).mappings().first()
        return jsonify({'video_url': row['video_url'] if row else None})
    except Exception:
        return jsonify({'video_url': None})


def _trigger_github_actions(job_id):
    """Fire a repository_dispatch to start the Actions video workflow."""
    gh_pat  = os.environ.get('GH_PAT', '')
    gh_repo = os.environ.get('GH_REPO', 'juli20008/tourit')
    if not gh_pat:
        return False
    try:
        r = requests.post(
            f'https://api.github.com/repos/{gh_repo}/dispatches',
            headers={
                'Authorization': f'Bearer {gh_pat}',
                'Accept': 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
            },
            json={'event_type': 'generate-video', 'client_payload': {'job_id': job_id}},
            timeout=10,
        )
        return r.status_code == 204
    except Exception:
        return False


@xhs_routes.route('/agent/suggest-cover/<mls_number>', methods=['POST'])
def suggest_cover(mls_number):
    """Use AI to suggest 3 cover lines (max 7 chars each) based on listing data."""
    from flask_login import current_user
    from app.models.mls_listing import MlsListing
    import requests as _req, os as _os, re as _re

    if not current_user.is_authenticated:
        return jsonify({'error': 'Unauthorized'}), 401
    if not current_user.agent:
        return jsonify({'error': 'Agent account required'}), 403

    data = request.get_json(silent=True) or {}
    external_listing = data.get('external_listing') or None

    if external_listing:
        bed   = external_listing.get('bed', '')
        bath  = external_listing.get('bath', '')
        sqft  = external_listing.get('sqft', '')
        style = external_listing.get('style', '')
        city  = external_listing.get('city', '')
        desc  = (external_listing.get('description') or '')[:300]
        beds_above = external_listing.get('beds_above_grade')
        bsmt_beds  = external_listing.get('basement_beds')
    else:
        listing = MlsListing.query.filter_by(mls_number=mls_number).first()
        if not listing:
            return jsonify({'error': f'Listing {mls_number} not found'}), 404
        def _ga(a): return getattr(listing, a, None)
        bed   = listing.bed or ''
        bath  = listing.bath or ''
        sqft  = listing.sqft or ''
        style = listing.style or listing.property_type or ''
        city  = listing.city or ''
        desc  = (listing.description or '')[:300]
        beds_above = _ga('beds_above_grade')
        bsmt_beds  = _ga('basement_beds')

    if beds_above and bsmt_beds:
        bed_str = f"{beds_above}+{bsmt_beds}卧"
    elif beds_above:
        bed_str = f"{beds_above}室"
    else:
        bed_str = f"{bed}室" if bed else ""

    api_key = _os.environ.get("DEEPSEEK_API_KEY", "")
    if not api_key:
        return jsonify({'error': 'AI not configured'}), 502

    prompt = f"""你是小红书房产内容创作者。根据以下房源信息，推荐3行封面文字。

规则（非常严格）：
- 每行最多7个汉字，标点不计
- 突出最吸引眼球的卖点：户型、面积、特色配置、地段
- 口语化、有冲击力，像小红书爆款标题
- 禁止用"性价比""大空间""采光好""格局好"等空洞词
- 不要提价格

房源信息：{style}，{bed_str}{bath}卫{f'，{sqft} sqft' if sqft else ''}，{city}
描述摘要：{desc}

只输出JSON数组，3个字符串，例如：["独栋4卧联排", "超大主卧套间", "步入式衣帽间"]"""

    try:
        resp = _req.post(
            "https://api.deepseek.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"model": "deepseek-chat", "max_tokens": 200,
                  "messages": [{"role": "user", "content": prompt}]},
            timeout=30,
        )
        raw = resp.json().get("choices", [{}])[0].get("message", {}).get("content", "").strip()
        m = _re.search(r'\[.*?\]', raw, _re.DOTALL)
        if not m:
            return jsonify({'error': 'AI returned unexpected format'}), 502
        import json as _json
        lines = _json.loads(m.group())
        # Enforce 7-char limit
        lines = [(l[:7] if isinstance(l, str) else '') for l in lines[:3]]
        while len(lines) < 3:
            lines.append('')
        return jsonify({'lines': lines})
    except Exception as e:
        return jsonify({'error': str(e)}), 502


@xhs_routes.route('/agent/draft-narration/<mls_number>', methods=['POST'])
def draft_narration(mls_number):
    """Generate narration text only (no video) so the agent can review and edit before generating."""
    from flask_login import current_user
    from app.models.mls_listing import MlsListing
    from app.services.xhs_video_service import (
        _generate_floor_narrations, _generate_narration,
        _FLOOR_ORDER, _FLOOR_ZH, MAX_PHOTOS, _build_photo_sequence_hint,
    )

    if not current_user.is_authenticated:
        return jsonify({'error': 'Unauthorized'}), 401
    if not current_user.agent:
        return jsonify({'error': 'Agent account required'}), 403

    data = request.get_json(silent=True) or {}
    cover_lines = [
        str(data.get('cover1', '') or '')[:40],
        str(data.get('cover2', '') or '')[:40],
        str(data.get('cover3', '') or '')[:40],
    ]
    photo_count = int(data.get('photo_count') or 30)
    narration_style = "rich" if photo_count >= 50 else "concise"
    external_listing = data.get('external_listing') or None
    # Floor breaks (1-indexed photo numbers)
    upper_start    = int(data.get('upper_start'))    if data.get('upper_start')    else None
    basement_start = int(data.get('basement_start')) if data.get('basement_start') else None

    if external_listing:
        listing_data = {
            'list_price':       external_listing.get('list_price'),
            'bed':              external_listing.get('bed'),
            'bath':             external_listing.get('bath'),
            'beds_above_grade': external_listing.get('beds_above_grade'),
            'basement_beds':    external_listing.get('basement_beds'),
            'city':             external_listing.get('city'),
            'neighborhood':     external_listing.get('neighborhood') or external_listing.get('city'),
            'description':      external_listing.get('description', ''),
            'style':            external_listing.get('style'),
            'property_type':    external_listing.get('style'),
            'sqft':             external_listing.get('sqft'),
        }
        n_photos = photo_count
        has_basement = bool(external_listing.get('basement_beds'))
    else:
        listing = MlsListing.query.filter_by(mls_number=mls_number).first()
        if not listing:
            return jsonify({'error': f'Listing {mls_number} not found'}), 404
        def _ga(attr):
            return getattr(listing, attr, None)
        listing_data = {
            'list_price':          listing.list_price,
            'bed':                 listing.bed,
            'bath':                listing.bath,
            'beds_above_grade':    _ga('beds_above_grade'),
            'basement_beds':       _ga('basement_beds'),
            'city':                listing.city,
            'neighborhood':        _ga('neighborhood') or listing.city,
            'description':         listing.description,
            'brokerage_remarks':   _ga('brokerage_remarks'),
            'style':               listing.style,
            'property_type':       listing.property_type,
            'sqft':                listing.sqft,
            'above_grade_sqft':    _ga('above_grade_sqft'),
            'features':            _ga('features'),
            'interior_features':   _ga('interior_features'),
            'building_features':   _ga('building_features'),
            'included_items':      _ga('included_items'),
            'exclusions':          _ga('exclusions'),
            'rental_items':        _ga('rental_items'),
            'room_info':           _ga('room_info'),
            'washroom_info':       _ga('washroom_info'),
            'garage_type':         _ga('garage_type'),
            'garage_spaces':       _ga('garage_spaces'),
            'parking_total':       _ga('parking_total'),
            'drive_type':          _ga('drive_type'),
            'lot_frontage':        _ga('lot_frontage'),
            'fronting_on':         _ga('fronting_on'),
            'pool':                _ga('pool'),
            'cooling':             _ga('cooling'),
            'heating':             _ga('heating'),
            'heating_source':      _ga('heating_source'),
            'water':               _ga('water'),
            'sewers':              _ga('sewers'),
            'exterior':            _ga('exterior'),
            'roof':                _ga('roof'),
            'foundation':          _ga('foundation'),
            'basement':            _ga('basement'),
            'approx_age':          _ga('approx_age'),
            'taxes':               _ga('taxes'),
            'tax_year':            _ga('tax_year'),
            'possession_type':     _ga('possession_type'),
            'special_designations':_ga('special_designations'),
        }
        n_photos = min(len(listing.effective_images or []), MAX_PHOTOS) or MAX_PHOTOS
        has_basement = bool(_ga('basement_beds'))

    # Build floor-level active_groups from floor breaks
    if upper_start and 2 <= upper_start <= n_photos:
        upper_end  = (basement_start - 1) if (basement_start and basement_start > upper_start) else n_photos
        main_n     = upper_start - 1
        upper_n    = max(1, upper_end - upper_start + 1)
        base_n     = max(0, n_photos - basement_start + 1) if basement_start else 0
        active_groups = [("main_floor", max(1, main_n)), ("upper_floor", upper_n)]
        if base_n > 0:
            active_groups.append(("basement", base_n))
    else:
        # Heuristic proportions when no floor breaks provided
        ext_n   = max(1, int(n_photos * 0.12))
        main_n  = max(2, int(n_photos * 0.43))
        upper_n = max(2, int(n_photos * 0.25))
        base_n  = n_photos - ext_n - main_n - upper_n
        active_groups = [
            ("exterior",    ext_n),
            ("main_floor",  main_n),
            ("upper_floor", upper_n),
        ]
        if has_basement and base_n > 0:
            active_groups.append(("basement", base_n))

    CLOSING = "如果你觉得我挑的房子不错，记得点赞订阅，或者找我定制私人找房服务。"

    # Fetch photos and build sequence hint for narration alignment
    photo_seq = None
    try:
        deepseek_key = os.environ.get("DEEPSEEK_API_KEY", "")
        img_urls = []
        if external_listing:
            img_urls = (external_listing.get('images') or [])[:MAX_PHOTOS]
        else:
            img_urls = (listing.effective_images or [])[:MAX_PHOTOS]
        if img_urls and deepseek_key:
            photo_inputs = []
            for url in img_urls:
                try:
                    r = requests.get(url, timeout=10)
                    if r.ok:
                        photo_inputs.append((url, r.content))
                except Exception:
                    pass
            if photo_inputs:
                photo_seq = _build_photo_sequence_hint(photo_inputs, deepseek_key)
    except Exception:
        pass

    floor_texts = _generate_floor_narrations(listing_data, active_groups, cover_lines=cover_lines,
                                             style=narration_style, photo_sequence=photo_seq)
    if floor_texts and len(floor_texts) == len(active_groups):
        floor_texts[-1] = floor_texts[-1] + CLOSING
        labeled = []
        for (floor, _), text in zip(active_groups, floor_texts):
            labeled.append(f"【{_FLOOR_ZH[floor]}】\n{text}")
        narration = "\n\n---\n\n".join(labeled)
    else:
        narration = _generate_narration(listing_data, cover_lines=cover_lines, photo_count=n_photos)
        if narration:
            narration = narration + CLOSING

    if not narration:
        return jsonify({'error': 'AI narration generation failed — check DEEPSEEK_API_KEY'}), 502

    return jsonify({'narration': narration})


@xhs_routes.route('/agent/video/<mls_number>', methods=['POST'])
def generate_agent_video(mls_number):
    """Start XHS video generation. Accepts multipart/form-data with optional intro video."""
    from flask_login import current_user
    from flask import current_app
    from app.services.xhs_db_jobs import ensure_jobs_table, create_job
    from app.services.xhs_video_service import start_video_job
    import uuid

    if not current_user.is_authenticated:
        return jsonify({'error': 'Unauthorized'}), 401
    if not current_user.agent:
        return jsonify({'error': 'Agent account required'}), 403

    MAX_COVER_BG_BYTES = 10 * 1024 * 1024  # 10 MB

    if request.content_type and 'multipart' in request.content_type:
        cover_lines = [
            str(request.form.get('cover1', '') or '')[:40],
            str(request.form.get('cover2', '') or '')[:40],
            str(request.form.get('cover3', '') or '')[:40],
        ]
        cover_photo_index = max(0, int(request.form.get('cover_photo_index', 0) or 0))
        narration_override = (request.form.get('narration_override') or '').strip() or None
        photo_count = int(request.form.get('photo_count') or 30)
        intro_file = request.files.get('intro_video')
        intro_bytes = intro_file.read() if intro_file and intro_file.filename else None
        cover_bg_file = request.files.get('cover_bg')
        cover_bg_bytes = cover_bg_file.read(MAX_COVER_BG_BYTES + 1) if cover_bg_file and cover_bg_file.filename else None
        if cover_bg_bytes and len(cover_bg_bytes) > MAX_COVER_BG_BYTES:
            cover_bg_bytes = None
        import json as _json
        _ext = request.form.get('external_listing')
        external_listing = _json.loads(_ext) if _ext else None
        _us = request.form.get('upper_start')
        upper_start   = int(_us) if _us else None
        _bs = request.form.get('basement_start')
        basement_start = int(_bs) if _bs else None
    else:
        data = request.get_json(silent=True) or {}
        cover_lines = [
            str(data.get('cover1', '') or '')[:40],
            str(data.get('cover2', '') or '')[:40],
            str(data.get('cover3', '') or '')[:40],
        ]
        cover_photo_index = max(0, int(data.get('cover_photo_index', 0) or 0))
        narration_override = (data.get('narration_override') or '').strip() or None
        intro_bytes = None
        cover_bg_bytes = None
        external_listing = data.get('external_listing') or None
        upper_start    = int(data.get('upper_start'))    if data.get('upper_start')    else None
        basement_start = int(data.get('basement_start')) if data.get('basement_start') else None

    use_actions = bool(os.environ.get('GH_PAT'))

    if use_actions:
        job_id = uuid.uuid4().hex
        intro_r2_key = None
        cover_bg_r2_key = None

        # Upload intro video to R2 as temp file
        if intro_bytes and len(intro_bytes) > 1000:
            try:
                from app.s3_helpers import _upload_bytes
                ext = 'mp4' if (intro_bytes[:4] in (b'\x00\x00\x00\x18', b'\x00\x00\x00\x20') or intro_bytes[4:8] == b'ftyp') else 'webm'
                intro_r2_key = f'tmp-intros/{job_id}.{ext}'
                _upload_bytes(intro_bytes, intro_r2_key, f'video/{ext}')
            except Exception:
                intro_r2_key = None

        # Upload cover background image to R2 if provided
        if cover_bg_bytes and len(cover_bg_bytes) > 100:
            try:
                from app.s3_helpers import _upload_bytes
                cover_bg_r2_key = f'tmp-cover-bg/{job_id}.jpg'
                _upload_bytes(cover_bg_bytes, cover_bg_r2_key, 'image/jpeg')
            except Exception:
                cover_bg_r2_key = None

        try:
            ensure_jobs_table()
            create_job(job_id, mls_number, current_user.id, cover_lines, intro_r2_key, cover_bg_r2_key,
                       cover_photo_index=cover_photo_index, narration_text=narration_override,
                       photo_count=photo_count)
        except Exception as e:
            return jsonify({'error': f'DB error: {e}'}), 500

        dispatched = _trigger_github_actions(job_id)
        if not dispatched:
            return jsonify({'error': 'Failed to trigger video generation. Check GH_PAT.'}), 500

        return jsonify({'job_id': job_id, 'status': 'queued'})

    # Fallback: run in background thread on this server
    job_id = start_video_job(
        mls_number, current_user.id, cover_lines,
        current_app._get_current_object(),
        intro_bytes=intro_bytes,
        cover_bg_bytes=cover_bg_bytes,
        cover_photo_index=cover_photo_index,
        narration_override=narration_override,
        external_listing=external_listing,
        photo_count=photo_count,
        upper_start=upper_start,
        basement_start=basement_start,
    )
    return jsonify({'job_id': job_id, 'status': 'processing'})


@xhs_routes.route('/agent/video/status/<job_id>', methods=['GET'])
def get_video_status(job_id):
    """Poll video generation job status."""
    from flask_login import current_user

    if not current_user.is_authenticated:
        return jsonify({'error': 'Unauthorized'}), 401

    if os.environ.get('GH_PAT'):
        from app.services.xhs_db_jobs import get_job
    else:
        from app.services.xhs_video_service import get_job

    job = get_job(job_id)
    if not job:
        return jsonify({'status': 'not_found'}), 404

    return jsonify({k: v for k, v in job.items() if k != 'ts'})


@xhs_routes.route('/download', methods=['GET'])
def proxy_download():
    """
    Proxy-download a file from R2 so iOS Safari gets Content-Disposition: attachment.
    iOS ignores the HTML `download` attribute on cross-origin URLs, but respects
    the header when the response comes from the same origin (api.tourit.ca).
    """
    from flask import Response, stream_with_context
    from urllib.parse import urlparse

    url  = request.args.get('url', '').strip()
    name = request.args.get('name', 'video.mp4').strip()

    if not url:
        return jsonify({'error': 'missing url'}), 400

    # Security: only proxy URLs from our own storage domains
    allowed_hosts = {'media.tourit.ca', 'pub-'}
    parsed = urlparse(url)
    host = parsed.netloc
    if not (host == 'media.tourit.ca' or host.endswith('.r2.dev') or host.endswith('.r2.cloudflarestorage.com')):
        return jsonify({'error': 'forbidden'}), 403

    try:
        r = requests.get(url, stream=True, timeout=60)
        r.raise_for_status()
    except Exception as e:
        return jsonify({'error': str(e)}), 502

    content_type = r.headers.get('Content-Type', 'application/octet-stream')

    def generate():
        for chunk in r.iter_content(chunk_size=65536):
            if chunk:
                yield chunk

    resp = Response(stream_with_context(generate()), content_type=content_type)
    resp.headers['Content-Disposition'] = f'attachment; filename="{name}"'
    resp.headers['Cache-Control'] = 'no-store'
    return resp


@xhs_routes.route('/test-tts', methods=['GET'])
def test_tts_models():
    """Dev helper: probe MiniMax TTS connectivity."""
    minimax_key  = os.environ.get('MINIMAX_API_KEY', '')
    minimax_base = os.environ.get('MINIMAX_BASE_URL', 'https://api.minimax.io')
    model        = os.environ.get('MINIMAX_TTS_MODEL', 'speech-02-hd')

    if not minimax_key:
        return jsonify({'error': 'MINIMAX_API_KEY not set'}), 500

    try:
        r = requests.post(
            f'{minimax_base}/v1/t2a_v2',
            headers={'Authorization': f'Bearer {minimax_key}', 'Content-Type': 'application/json'},
            json={
                'model': model,
                'text': '你好，这是一段测试语音。',
                'stream': False,
                'language_boost': 'auto',
                'voice_setting': {'voice_id': 'male-qn-jingying', 'speed': 1.0, 'vol': 1.0, 'pitch': 0},
                'audio_setting': {'audio_sample_rate': 32000, 'bitrate': 128000, 'format': 'mp3', 'channel': 1},
            },
            timeout=20,
        )
        if r.ok:
            data = r.json()
            audio_hex = data.get('data', {}).get('audio', '')
            return jsonify({
                'status': 'OK',
                'model': model,
                'audio_bytes': len(audio_hex) // 2,
                'base_resp': data.get('base_resp'),
            })
        return jsonify({'status': 'error', 'code': r.status_code, 'body': r.text[:300]})
    except Exception as e:
        return jsonify({'status': 'exception', 'error': str(e)}), 500


@xhs_routes.route('/extension/video', methods=['POST', 'OPTIONS'])
@cross_origin(origins='*')
def extension_generate_video():
    """Extension-triggered video generation — no browser session required."""
    if request.method == 'OPTIONS':
        return '', 204

    expected_key = os.environ.get('EXTENSION_API_KEY', '')
    data = request.get_json(silent=True) or {}

    if expected_key and data.get('extension_key') != expected_key:
        return jsonify({'error': 'Unauthorized'}), 401

    listing = data.get('listing')
    if not listing or not listing.get('images'):
        return jsonify({'error': 'listing with images required'}), 400

    agent_id = int(os.environ.get('EXTENSION_AGENT_ID', 0))
    if not agent_id:
        return jsonify({'error': 'EXTENSION_AGENT_ID not configured on server'}), 503

    cover_lines = [
        str(data.get('cover1', '') or '')[:40],
        str(data.get('cover2', '') or '')[:40],
        str(data.get('cover3', '') or '')[:40],
    ]

    from flask import current_app
    from app.services.xhs_video_service import start_video_job

    mls_number = listing.get('mls_number') or 'ext-listing'
    job_id = start_video_job(
        mls_number, agent_id, cover_lines,
        current_app._get_current_object(),
        external_listing=listing,
    )
    return jsonify({'job_id': job_id, 'status': 'processing'})


@xhs_routes.route('/extension/video/status/<job_id>', methods=['GET', 'OPTIONS'])
@cross_origin(origins='*')
def extension_video_status(job_id):
    """Poll video job status — no browser session required."""
    if request.method == 'OPTIONS':
        return '', 204

    from app.services.xhs_video_service import get_job
    job = get_job(job_id)
    if not job:
        return jsonify({'status': 'not_found'}), 404
    return jsonify({k: v for k, v in job.items() if k != 'ts'})


@xhs_routes.route('/rewrite', methods=['POST', 'OPTIONS'])
@cross_origin(origins='*')
def rewrite_for_xhs():
    """Generate a 小红书-style post from listing data via DeepSeek."""
    if request.method == 'OPTIONS':
        return '', 204

    api_key = os.environ.get('DEEPSEEK_API_KEY', '')
    if not api_key:
        return jsonify({'error': 'AI rewrite not configured'}), 503

    data      = request.get_json(silent=True) or {}
    device_id = data.get('device_id', '').strip()

    if not device_id:
        return jsonify({'error': 'not_logged_in'}), 401

    # ── Credit check ───────────────────────────────────────────────────────────
    credits = None
    try:
        credits = _get_or_create_credits(device_id)
        if credits['free_used'] >= FREE_LIMIT and credits['paid_credits'] <= 0:
            return jsonify({
                'error':        'no_credits',
                'free_used':    credits['free_used'],
                'paid_credits': 0,
            }), 402
    except Exception:
        credits = None  # fail open so AI is not blocked by Supabase downtime

    # ── Build prompt ───────────────────────────────────────────────────────────
    listing         = data.get('listing', {})
    city_zh         = data.get('city_zh', '') or listing.get('city', '多伦多')
    type_zh         = data.get('type_zh', '') or '住宅'
    translated_desc = data.get('translated_desc', '') or '（无描述）'

    price  = f"{int(listing.get('price') or 0):,}"
    beds   = listing.get('beds', '?')
    baths  = listing.get('baths', '?')

    prompt = f"""你是一位在加拿大多伦多从业多年的华人房产经纪，专门帮助华人买家找到心仪的房子。请根据以下房源信息，用小红书风格写一篇购房推荐帖。

房源信息：
城市/区域：{city_zh}
地址：{listing.get('address', '')}
房型：{type_zh}
卧室：{beds} 间
卫生间：{baths} 间
售价：${price} 加元
房源描述：{translated_desc}

写作要求：
- 第一段：一句话点明房源地点、类型和价格，结合区域特色自然带出
- 中间各段：将房源描述原文中的每一句话单独成一段，逐句忠实扩写，不得改变原意、不得添加原文未提及的设施或特点，每段2-3句，语气真诚平实
- 段与段之间空一行
- 最后一行：8-10个 hashtag，含具体城市和房型标签，用买房/置业而非租房
- 每段最多 1 个 emoji
- 不要虚构任何未在描述中提到的设施或特点
- 不要写任何预约、私信、扫码、抢手等呼吁行动的内容
- 不要使用极端或夸张词汇，例如：最好、最优、最大、最强、最便宜、最豪华、顶级、绝对、必须、保证、承诺、一定、超值、无敌、爆款、秒杀、稀缺、独家、升值保证、回报率等
- 语气平实客观，避免任何可能触发小红书审核的夸大宣传表述
- 全文禁止出现任何 ** 符号"""

    try:
        resp = requests.post(
            'https://api.deepseek.com/v1/chat/completions',
            headers={'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json'},
            json={'model': 'deepseek-chat', 'max_tokens': 1024, 'messages': [{'role': 'user', 'content': prompt}]},
            timeout=30,
        )
        if not resp.ok:
            return jsonify({'error': f'DeepSeek error {resp.status_code}'}), 502

        text = resp.json().get('choices', [{}])[0].get('message', {}).get('content', '').strip()

        # Deduct credit only after successful AI generation
        if device_id and credits is not None:
            try:
                _deduct_credit(device_id, credits)
            except Exception:
                pass

        return jsonify({'text': text})

    except Exception as e:
        return jsonify({'error': str(e)}), 500
