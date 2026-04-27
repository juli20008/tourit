"""Initialize the database with all tables and seed data."""

from app import app, db
from app.seeds import (
    seed_users,
    seed_states,
    seed_properties,
    seed_property_imgs,
    seed_reviews,
    seed_appointments,
    seed_aa,
    seed_channel,
)

with app.app_context():
    print("Creating all database tables...")
    db.create_all()
    
    print("Seeding database with initial data...")
    seed_states()
    seed_users()
    seed_properties()
    seed_property_imgs()
    seed_reviews()
    seed_appointments()
    seed_aa()
    seed_channel()
    
    print("[OK] Database initialized successfully!")
    print(f"[OK] Database: {app.config['SQLALCHEMY_DATABASE_URI']}")
    print("[OK] All seed data loaded!")
