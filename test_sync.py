import sys
sys.stdout.reconfigure(encoding='utf-8')

from dotenv import load_dotenv
load_dotenv()

from app import app
with app.app_context():
    from app.services.repliers_sync import sync_listings
    sync_listings(max_pages=3, verbose=True)
