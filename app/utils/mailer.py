import os
import requests


def send_magic_link(to_email, magic_url):
    api_key = os.environ.get('RESEND_API_KEY', '').strip()

    if not api_key:
        print(f'[DEV] Magic link for {to_email}: {magic_url}')
        return True

    from_addr = os.environ.get('MAIL_FROM', 'Tourit <onboarding@resend.dev>').strip()

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
