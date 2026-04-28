import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText


def send_magic_link(to_email, magic_url):
    host = os.environ.get('MAIL_SERVER', '')
    port = int(os.environ.get('MAIL_PORT', 587))
    username = os.environ.get('MAIL_USERNAME', '')
    password = os.environ.get('MAIL_PASSWORD', '')
    from_addr = os.environ.get('MAIL_FROM', username) or 'noreply@tourit.ca'

    if not host or not username or not password:
        # Dev: print to console instead of sending
        print(f'[DEV] Magic link for {to_email}: {magic_url}')
        return True

    msg = MIMEMultipart('alternative')
    msg['Subject'] = 'Your Tourit Agent Login Link'
    msg['From'] = f'Tourit <{from_addr}>'
    msg['To'] = to_email

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

    msg.attach(MIMEText(text_body, 'plain'))
    msg.attach(MIMEText(html_body, 'html'))

    try:
        with smtplib.SMTP(host, port) as smtp:
            smtp.ehlo()
            smtp.starttls()
            smtp.login(username, password)
            smtp.sendmail(from_addr, to_email, msg.as_string())
        return True
    except Exception as e:
        print(f'[ERROR] Failed to send magic link email: {e}')
        return False
