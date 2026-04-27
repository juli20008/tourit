"""Reset the database and reload all seed data"""
from app import app, db
from sqlalchemy import text

with app.app_context():
    print("Clearing existing data...")
    
    # Drop all tables and recreate (cleanest approach)
    db.drop_all()
    print("[OK] All tables dropped")
    
    print("Creating all database tables...")
    db.create_all()
    print("[OK] All tables created")
    
    print("Seeding database with initial data...")
    from app.seeds import seed_states, seed_users, seed_properties, seed_property_imgs
    from app.seeds import seed_reviews, seed_appointments, seed_aa, seed_zip_city, seed_channel, seed_chat
    
    seed_states()
    seed_users()
    seed_properties()
    seed_property_imgs()
    seed_reviews()
    seed_appointments()
    seed_aa()
    seed_zip_city()
    seed_channel()
    seed_chat()
    
    print("[OK] Database reset and seeded successfully!")
    print(f"[OK] Database: {app.config['SQLALCHEMY_DATABASE_URI']}")
