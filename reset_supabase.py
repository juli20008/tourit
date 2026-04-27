from dotenv import load_dotenv
load_dotenv()

from app import app
from app.models.db import db

with app.app_context():
    tables = [
        'chats', 'channels', 'appointments', 'reviews',
        'agent_availabilities', 'agent_areas', 'property_imgs',
        'properties', 'users', 'zip_cities', 'states'
    ]
    for t in tables:
        try:
            db.session.execute(db.text(f'TRUNCATE TABLE {t} RESTART IDENTITY CASCADE'))
            print(f'Truncated {t}')
        except Exception as e:
            db.session.rollback()
            print(f'Error {t}: {e}')
    db.session.commit()
    print('All tables cleared.')
