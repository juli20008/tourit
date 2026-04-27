from dotenv import load_dotenv
load_dotenv()
from app import app
from app.models.db import db

with app.app_context():
    tables = ['users', 'states', 'properties', 'property_imgs', 'reviews',
              'appointments', 'agent_availabilities', 'agent_areas', 'channels', 'chats']
    for t in tables:
        r = db.session.execute(db.text(f'SELECT COUNT(*) FROM {t}')).fetchone()
        print(f'  {t}: {r[0]} rows')
