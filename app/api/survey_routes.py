from flask import Blueprint, request, jsonify
import os, requests

survey_routes = Blueprint('survey', __name__)

NOTIFY_EMAIL = "julie.li.realtor@gmail.com"


def _send_survey_email(data):
    api_key = os.environ.get('RESEND_API_KEY', '').strip()
    if not api_key:
        print(f"[DEV] Survey submission: {data}")
        return

    contact = data.get('contact') or {}
    name    = contact.get('name', '—')
    wechat  = contact.get('wechat', '—')
    email   = contact.get('email', '—')

    def row(label, value):
        if not value or value == '—':
            return ''
        if isinstance(value, dict):
            value = f"{value.get('min','?')} – {value.get('max','?')}"
        elif isinstance(value, list):
            value = '、'.join(value) if value else '—'
        return f'''
        <tr>
          <td style="padding:8px 12px;font-size:13px;color:#6b7280;white-space:nowrap;vertical-align:top">{label}</td>
          <td style="padding:8px 12px;font-size:14px;color:#1a1a1a;font-weight:500">{value}</td>
        </tr>'''

    rows = (
        row("身份", data.get('identity')) +
        row("预算", data.get('budget')) +
        row("区域", data.get('area')) +
        row("位置偏好", data.get('location_pref')) +
        row("学区需求", data.get('school')) +
        row("房屋类型", data.get('property_type')) +
        row("卧室数量", data.get('bedrooms')) +
        row("必要条件 Must Have", data.get('must_haves')) +
        row("Nice to Have", data.get('nice_to_have')) +
        row("购房时间线", data.get('timeline'))
    )

    html = f"""<!DOCTYPE html>
<html>
<body style="font-family:'Inter',sans-serif;background:#f7f6f2;margin:0;padding:40px 0">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,.08)">
    <div style="background:#2d4a22;padding:20px 28px">
      <div style="color:#dfba73;font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase">新买家需求表单</div>
      <div style="color:#fff;font-size:20px;font-weight:700;margin-top:4px">🏡 {name}</div>
    </div>
    <div style="padding:24px 28px">
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px 16px;margin-bottom:20px">
        <div style="font-size:12px;color:#6b7280;margin-bottom:4px">联系方式</div>
        <div style="font-size:15px;font-weight:600;color:#1a1a1a">微信/电话：{wechat}</div>
        {'<div style="font-size:14px;color:#374151;margin-top:4px">Email：' + email + '</div>' if email and email != '—' else ''}
      </div>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
        <thead>
          <tr style="background:#f9fafb">
            <th style="padding:8px 12px;font-size:12px;color:#6b7280;text-align:left;font-weight:600">项目</th>
            <th style="padding:8px 12px;font-size:12px;color:#6b7280;text-align:left;font-weight:600">答案</th>
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
    <div style="padding:12px 28px 20px;font-size:12px;color:#9ca3af">
      来自 tourit.ca/buyersurvey.html
    </div>
  </div>
</body>
</html>"""

    subject = f"🏡 新买家需求 — {name}（{data.get('budget', '')}，{', '.join((data.get('area') or [])[:2])}）"

    try:
        from_addr = os.environ.get('MAIL_FROM', 'Tourit <NoReply@tourit.ca>').strip()
        requests.post(
            'https://api.resend.com/emails',
            headers={'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json'},
            json={
                'from': from_addr,
                'to': [NOTIFY_EMAIL],
                'subject': subject,
                'html': html,
            },
            timeout=10,
        )
    except Exception as e:
        print(f'[MAIL ERROR] survey: {e}')


@survey_routes.route('/buyer', methods=['POST', 'OPTIONS'])
def buyer_survey():
    if request.method == 'OPTIONS':
        return '', 204
    data = request.get_json(silent=True) or {}
    if not data:
        return jsonify({'error': 'No data'}), 400
    contact = data.get('contact') or {}
    if not contact.get('name') or not contact.get('wechat'):
        return jsonify({'error': 'Name and contact required'}), 400
    _send_survey_email(data)
    return jsonify({'ok': True}), 200
