import sys
sys.stdout.reconfigure(encoding='utf-8')
from dotenv import load_dotenv
load_dotenv()
from app import app

with app.test_client() as c:
    r = c.get('/api/listings/')
    print('Status:', r.status_code)
    print('Data:', r.data[:500].decode('utf-8', errors='replace'))

    r2 = c.get('/api/listings/?city=ZEPHYR&per_page=2')
    print('\nCity filter status:', r2.status_code)
    print('Data:', r2.data[:300].decode('utf-8', errors='replace'))
