import os
import requests


SIGNUP_NOTIFY_EMAIL = "julie.li.realtor@gmail.com"


def send_guest_booking_alert(address, date, time_str, guest_id):
    """Anonymous guest booked — notify Julie so she can watch the conversation."""
    api_key = os.environ.get('RESEND_API_KEY', '').strip()
    if not api_key:
        print(f'[DEV] Guest booking alert: {address} on {date} {time_str}')
        return

    from_addr = os.environ.get('MAIL_FROM', 'Tourit <NoReply@tourit.ca>').strip()
    html_body = f"""<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;background:#f3f3f1;margin:0;padding:40px 0">
  <div style="max-width:480px;margin:0 auto;background:white;border-radius:16px;padding:40px;box-shadow:0 1px 6px rgba(0,0,0,.08)">
    <div style="font-size:18px;font-weight:700;color:#0f172a;margin-bottom:8px">&#127968; Anonymous Showing Request</div>
    <p style="color:#475569;font-size:15px;line-height:1.6">
      A visitor just requested a tour. They haven't left contact info yet — watch for their message.
    </p>
    <div style="background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;padding:16px;margin:16px 0">
      <div style="font-size:13px;color:#64748b;margin-bottom:2px">Property</div>
      <div style="font-size:15px;font-weight:600;color:#0f172a">{address}</div>
      <div style="font-size:13px;color:#64748b;margin-top:10px;margin-bottom:2px">Requested time</div>
      <div style="font-size:15px;font-weight:600;color:#0f172a">{date} at {time_str}</div>
    </div>
    <p style="color:#94a3b8;font-size:12px">
      If they leave contact info you will receive a follow-up alert. Guest ID: {guest_id[:8]}&hellip;
    </p>
  </div>
</body>
</html>"""

    try:
        requests.post(
            'https://api.resend.com/emails',
            headers={'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json'},
            json={
                'from': from_addr,
                'to': [SIGNUP_NOTIFY_EMAIL],
                'subject': f'\U0001f3e0 Anonymous showing request — {address}',
                'html': html_body,
                'text': f'Anonymous visitor requested a tour at {address} on {date} at {time_str}. No contact info yet.',
            },
            timeout=10,
        )
    except Exception as e:
        print(f'[MAIL ERROR] send_guest_booking_alert: {e}')


def send_guest_lead_captured(address, date, time_str, phone, email):
    """Guest submitted contact info — high-priority lead alert for Julie."""
    api_key = os.environ.get('RESEND_API_KEY', '').strip()
    if not api_key:
        print(f'[DEV] Lead captured: phone={phone} email={email} for {address} on {date} {time_str}')
        return

    from_addr = os.environ.get('MAIL_FROM', 'Tourit <NoReply@tourit.ca>').strip()
    contact_rows = ""
    if phone:
        contact_rows += f'<div style="font-size:16px;font-weight:700;color:#0f172a">&#128241; {phone}</div>'
    if email:
        contact_rows += f'<div style="font-size:16px;font-weight:700;color:#0f172a">&#9993; {email}</div>'

    html_body = f"""<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;background:#f3f3f1;margin:0;padding:40px 0">
  <div style="max-width:480px;margin:0 auto;background:white;border-radius:16px;padding:40px;box-shadow:0 1px 6px rgba(0,0,0,.08)">
    <div style="font-size:18px;font-weight:700;color:#16a34a;margin-bottom:8px">&#128293; Lead Captured!</div>
    <p style="color:#475569;font-size:15px;line-height:1.6">
      A visitor left their contact info after requesting a tour. Follow up now!
    </p>
    <div style="background:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0;padding:16px;margin:16px 0">
      <div style="font-size:13px;color:#64748b;margin-bottom:6px">Contact Info</div>
      {contact_rows}
      <div style="font-size:13px;color:#64748b;margin-top:12px;margin-bottom:2px">Property</div>
      <div style="font-size:15px;font-weight:600;color:#0f172a">{address}</div>
      <div style="font-size:13px;color:#64748b;margin-top:8px;margin-bottom:2px">Requested time</div>
      <div style="font-size:15px;font-weight:600;color:#0f172a">{date} at {time_str}</div>
    </div>
  </div>
</body>
</html>"""

    try:
        requests.post(
            'https://api.resend.com/emails',
            headers={'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json'},
            json={
                'from': from_addr,
                'to': [SIGNUP_NOTIFY_EMAIL],
                'subject': f'\U0001f525 Lead captured — {address}',
                'html': html_body,
                'text': f'Lead captured! {phone or email} requested a tour at {address} on {date} at {time_str}.',
            },
            timeout=10,
        )
    except Exception as e:
        print(f'[MAIL ERROR] send_guest_lead_captured: {e}')


def send_agent_signup_request(applicant_email):
    """Notify Julie that an agent wants to sign up."""
    api_key = os.environ.get('RESEND_API_KEY', '').strip()

    if not api_key:
        print(f'[DEV] Agent signup request from {applicant_email}')
        return True

    from_addr = os.environ.get('MAIL_FROM', 'Tourit <NoReply@tourit.ca>').strip()
    html_body = f"""<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;background:#f3f3f1;margin:0;padding:40px 0">
  <div style="max-width:480px;margin:0 auto;background:white;border-radius:16px;padding:40px;box-shadow:0 1px 6px rgba(0,0,0,.08)">
    <div style="font-size:20px;font-weight:700;color:#0f172a;margin-bottom:16px">New Agent Signup Request</div>
    <p style="color:#475569;font-size:15px;line-height:1.6">
      A realtor has requested an account on Tourit:
    </p>
    <p style="font-size:16px;font-weight:600;color:#0f172a;margin:16px 0;padding:12px 16px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0">
      {applicant_email}
    </p>
    <p style="color:#94a3b8;font-size:13px">
      Reply to this email or set them up in the Tourit dashboard.
    </p>
  </div>
</body>
</html>"""

    try:
        resp = requests.post(
            'https://api.resend.com/emails',
            headers={
                'Authorization': f'Bearer {api_key}',
                'Content-Type': 'application/json',
            },
            json={
                'from': from_addr,
                'to': [SIGNUP_NOTIFY_EMAIL],
                'reply_to': applicant_email,
                'subject': f'Agent signup request: {applicant_email}',
                'html': html_body,
                'text': f'New agent signup request from: {applicant_email}',
            },
            timeout=10,
        )
        return resp.status_code in (200, 201)
    except requests.RequestException as e:
        print(f'[MAIL ERROR] send_agent_signup_request: {e}')
        return False


def send_xhs_video_ready(to_email, agent_name, listing_address, video_url):
    api_key = os.environ.get('RESEND_API_KEY', '').strip()
    if not api_key:
        print(f'[DEV] XHS video ready for {to_email}: {video_url}')
        return
    from_addr = os.environ.get('MAIL_FROM', 'Tourit <NoReply@tourit.ca>').strip()
    html_body = f"""<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;background:#f3f3f1;margin:0;padding:40px 0">
  <div style="max-width:480px;margin:0 auto;background:white;border-radius:16px;padding:40px;box-shadow:0 1px 6px rgba(0,0,0,.08)">
    <div style="font-size:22px;font-weight:700;color:#0f172a;margin-bottom:8px">🎬 小红书视频已生成</div>
    <p style="color:#475569;font-size:15px;line-height:1.6">
      Hi {agent_name}，你的看房视频已经生成完成！<br/>
      <strong>{listing_address}</strong>
    </p>
    <a href="{video_url}"
       style="display:inline-block;margin:20px 0;padding:13px 28px;background:#0f172a;color:white;
              text-decoration:none;border-radius:10px;font-weight:600;font-size:15px">
      下载视频 Download Video
    </a>
    <p style="color:#94a3b8;font-size:12px">此链接有效期 7 天。This link expires in 7 days.</p>
  </div>
</body>
</html>"""
    try:
        requests.post(
            'https://api.resend.com/emails',
            headers={'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json'},
            json={
                'from': from_addr,
                'to': [to_email],
                'subject': f'🎬 看房视频已就绪 — {listing_address}',
                'html': html_body,
            },
            timeout=10,
        )
    except Exception as e:
        print(f'[MAIL ERROR] xhs video notify: {e}')


def send_magic_link(to_email, magic_url):
    api_key = os.environ.get('RESEND_API_KEY', '').strip()

    if not api_key:
        print(f'[DEV] Magic link for {to_email}: {magic_url}')
        return True

    from_addr = os.environ.get('MAIL_FROM', 'Tourit <NoReply@tourit.ca>').strip()

    text_body = (
        f'Log in to your Tourit agent account:\n\n{magic_url}\n\n'
        'This link expires in 30 minutes. If you did not request this, ignore this email.'
    )
    html_body = f"""<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;background:#f3f3f1;margin:0;padding:40px 0">
  <div style="max-width:480px;margin:0 auto;background:white;border-radius:16px;padding:40px;box-shadow:0 1px 6px rgba(0,0,0,.08)">
    <div style="font-size:22px;font-weight:700;color:#0f172a;margin-bottom:8px">Tourit Agent Login</div>
    <p style="color:#475569;font-size:15px;line-height:1.6">
      Click the button below to sign in to your agent dashboard. This link expires in <strong>30 minutes</strong>.
    </p>
    <a href="{magic_url}"
       style="display:inline-block;margin:20px 0;padding:13px 28px;background:#0f172a;color:white;
              text-decoration:none;border-radius:10px;font-weight:600;font-size:15px">
      Log In to Tourit
    </a>
    <p style="color:#94a3b8;font-size:12px">
      If you did not request this link you can safely ignore this email.
    </p>
  </div>
</body>
</html>"""

    try:
        resp = requests.post(
            'https://api.resend.com/emails',
            headers={
                'Authorization': f'Bearer {api_key}',
                'Content-Type': 'application/json',
            },
            json={
                'from': from_addr,
                'to': [to_email],
                'subject': 'Your Tourit Agent Login Link',
                'html': html_body,
                'text': text_body,
            },
            timeout=10,
        )
        if resp.status_code in (200, 201):
            print(f'[MAIL] Sent magic link to {to_email}')
            return True
        print(f'[MAIL ERROR] Resend returned {resp.status_code}: {resp.text}')
        raise RuntimeError(f'Failed to send email: {resp.text}')
    except requests.RequestException as e:
        print(f'[MAIL ERROR] {e}')
        raise RuntimeError(f'Failed to send email: {e}')
