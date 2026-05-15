import os
import datetime
import requests
from flask import Blueprint, request, jsonify
from flask_cors import cross_origin

xhs_routes = Blueprint('xhs', __name__)

FREE_LIMIT = 5  # free uses per device per month


# ── Supabase REST helpers ──────────────────────────────────────────────────────

def _sb_url(path):
    return os.environ.get('SUPABASE_URL', '').rstrip('/') + f'/rest/v1/{path}'


def _sb_headers(extra=None):
    key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
    h = {'apikey': key, 'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'}
    if extra:
        h.update(extra)
    return h


def _current_month():
    return datetime.datetime.utcnow().strftime('%Y-%m')


def _maybe_reset(row, device_id, month):
    """If the row's reset_month is stale, zero free_used in DB and return updated row."""
    if row.get('reset_month') == month:
        return row
    try:
        requests.patch(
            _sb_url('xhs_credits'),
            headers=_sb_headers({'Prefer': 'return=minimal'}),
            params={'device_id': f'eq.{device_id}'},
            json={'free_used': 0, 'reset_month': month},
            timeout=5,
        )
    except Exception:
        pass
    row = dict(row)
    row['free_used'] = 0
    row['reset_month'] = month
    return row


def _get_or_create_credits(device_id):
    """Return {free_used, paid_credits, reset_month} row, creating/resetting if needed."""
    month = _current_month()
    r = requests.get(
        _sb_url('xhs_credits'),
        headers=_sb_headers(),
        params={'device_id': f'eq.{device_id}', 'select': 'free_used,paid_credits,reset_month'},
        timeout=5,
    )
    if r.ok:
        rows = r.json()
        if rows:
            return _maybe_reset(rows[0], device_id, month)

    ins = requests.post(
        _sb_url('xhs_credits'),
        headers=_sb_headers({'Prefer': 'resolution=ignore-duplicates,return=representation'}),
        json={'device_id': device_id, 'free_used': 0, 'paid_credits': 0, 'reset_month': month},
        timeout=5,
    )
    if ins.ok:
        rows = ins.json()
        if rows:
            return rows[0]

    # Row already existed and conflict was silently ignored — read it now
    r2 = requests.get(
        _sb_url('xhs_credits'),
        headers=_sb_headers(),
        params={'device_id': f'eq.{device_id}', 'select': 'free_used,paid_credits,reset_month'},
        timeout=5,
    )
    if r2.ok and r2.json():
        return _maybe_reset(r2.json()[0], device_id, month)

    return {'free_used': 0, 'paid_credits': 0, 'reset_month': month}


def _deduct_credit(device_id, row):
    params = {'device_id': f'eq.{device_id}'}
    if row['free_used'] < FREE_LIMIT:
        patch = {'free_used': row['free_used'] + 1}
    elif row['paid_credits'] > 0:
        patch = {'paid_credits': row['paid_credits'] - 1}
    else:
        return False
    r = requests.patch(
        _sb_url('xhs_credits'),
        headers=_sb_headers({'Prefer': 'return=minimal'}),
        params=params,
        json=patch,
        timeout=5,
    )
    return r.ok


def _add_paid_credits(device_id, qty):
    row = _get_or_create_credits(device_id)
    r = requests.patch(
        _sb_url('xhs_credits'),
        headers=_sb_headers({'Prefer': 'return=minimal'}),
        params={'device_id': f'eq.{device_id}'},
        json={'paid_credits': row['paid_credits'] + qty},
        timeout=5,
    )
    return r.ok


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
- 中间各段：将房源描述的亮点逐一展开，每个亮点独立成一段，每段2-3句，语气真诚具体
- 段与段之间空一行
- 最后一行：8-10个 hashtag，含具体城市和房型标签，用买房/置业而非租房
- 总字数 150-280 字，每段最多 1 个 emoji
- 不要虚构任何未在描述中提到的设施或特点
- 不要写任何预约、私信、扫码、抢手等呼吁行动的内容
- 不要使用极端或夸张词汇，例如：最好、最优、最大、最强、最便宜、最豪华、顶级、绝对、必须、保证、承诺、一定、超值、无敌、爆款、秒杀、稀缺、独家、升值保证、回报率等
- 语气平实客观，避免任何可能触发小红书审核的夸大宣传表述"""

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
