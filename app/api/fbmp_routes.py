import os
import requests
from flask import Blueprint, request, jsonify
from flask_cors import cross_origin

from .xhs_routes import (
    FREE_LIMIT,
    _get_or_create_credits,
    _deduct_credit,
    _add_paid_credits,
    _paypal_base,
    _paypal_access_token,
    _html_page,
)

fbmp_routes = Blueprint('fbmp', __name__)


@fbmp_routes.route('/credits', methods=['GET', 'OPTIONS'])
@cross_origin(origins='*')
def get_fbmp_credits():
    if request.method == 'OPTIONS':
        return '', 204
    device_id = request.args.get('device_id', '').strip()
    if not device_id:
        return jsonify({'error': 'device_id required'}), 400
    try:
        row = _get_or_create_credits(device_id)
        return jsonify({
            'free_used':    row['free_used'],
            'free_total':   FREE_LIMIT,
            'paid_credits': row['paid_credits'],
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@fbmp_routes.route('/use', methods=['POST', 'OPTIONS'])
@cross_origin(origins='*')
def use_fbmp_credit():
    """Check and deduct one FBMP fill credit."""
    if request.method == 'OPTIONS':
        return '', 204

    data      = request.get_json(silent=True) or {}
    device_id = data.get('device_id', '').strip()
    if not device_id:
        return jsonify({'error': 'device_id required'}), 400

    try:
        credits = _get_or_create_credits(device_id)
        if credits['free_used'] >= FREE_LIMIT and credits['paid_credits'] <= 0:
            return jsonify({
                'error':        'no_credits',
                'free_used':    credits['free_used'],
                'paid_credits': 0,
            }), 402

        ok = _deduct_credit(device_id, credits)
        if not ok:
            return jsonify({'error': 'credit deduction failed'}), 500

        return jsonify({'ok': True})

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@fbmp_routes.route('/checkout/create', methods=['POST', 'OPTIONS'])
@cross_origin(origins='*')
def fbmp_checkout_create():
    if request.method == 'OPTIONS':
        return '', 204
    if not os.environ.get('PAYPAL_CLIENT_ID') or not os.environ.get('PAYPAL_CLIENT_SECRET'):
        return jsonify({'error': 'PayPal not configured'}), 503

    data      = request.get_json(silent=True) or {}
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
                    'description': f'Tourit FBMP 发布次数 ×{quantity}',
                }],
                'application_context': {
                    'return_url':   f'{api_base}/api/fbmp/checkout/return?device_id={device_id}&quantity={quantity}',
                    'cancel_url':   f'{api_base}/api/fbmp/checkout/cancel',
                    'brand_name':   'Tourit',
                    'landing_page': 'BILLING',
                    'user_action':  'PAY_NOW',
                },
            },
            timeout=15,
        )
        if not r.ok:
            return jsonify({'error': f'PayPal order creation failed: {r.status_code}'}), 502

        order       = r.json()
        approve_url = next((l['href'] for l in order.get('links', []) if l['rel'] == 'approve'), None)
        if not approve_url:
            return jsonify({'error': 'No approval URL from PayPal'}), 502

        return jsonify({'approve_url': approve_url, 'order_id': order['id']})

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@fbmp_routes.route('/checkout/return', methods=['GET'])
def fbmp_checkout_return():
    order_token = request.args.get('token', '')
    device_id   = request.args.get('device_id', '').strip()
    quantity    = max(1, int(request.args.get('quantity', 10)))

    if not order_token or not device_id:
        return _html_page('❌ Missing parameters', 'Payment parameters incomplete — please try again.', error=True)

    try:
        access_token = _paypal_access_token()
        r = requests.post(
            f'{_paypal_base()}/v2/checkout/orders/{order_token}/capture',
            headers={'Authorization': f'Bearer {access_token}', 'Content-Type': 'application/json'},
            timeout=15,
        )
        if not r.ok:
            return _html_page('❌ Capture failed', f'PayPal returned {r.status_code} — please contact support.', error=True)

        if r.json().get('status') != 'COMPLETED':
            return _html_page('❌ Payment incomplete', f'Order status: {r.json().get("status")}', error=True)

        ok = _add_paid_credits(device_id, quantity)
        if not ok:
            return _html_page('⚠ Payment succeeded, credits not added',
                              'Please screenshot this page and contact support.', error=True)

        return _html_page(
            '✅ Top-up successful!',
            f'<strong>{quantity} FBMP fill credit{"s" if quantity != 1 else ""}</strong> added to your account.<br>'
            f'Close this tab and click ↻ in the extension popup.',
        )

    except Exception as e:
        return _html_page('❌ Server error', str(e), error=True)


@fbmp_routes.route('/checkout/cancel', methods=['GET'])
def fbmp_checkout_cancel():
    return _html_page('Payment cancelled', 'You cancelled the payment. Close this tab and try again from the extension.')
