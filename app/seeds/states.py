from app.models import db, State

def seed_states():
    try:
        # Check if states already exist
        if State.query.filter_by(state="ON").first():
            print("[OK] States already seeded, skipping...")
            return
        
        state1 = State(state="ON", long="Ontario")
        state2 = State(state="BC", long="British Columbia")
        state3 = State(state="AB", long="Alberta")
        state4 = State(state="MB", long="Manitoba")
        state5 = State(state="SK", long="Saskatchewan")
        state6 = State(state="QC", long="Quebec")
        state7 = State(state="NB", long="New Brunswick")
        state8 = State(state="NS", long="Nova Scotia")
        state9 = State(state="PE", long="Prince Edward Island")
        state10 = State(state="NL", long="Newfoundland and Labrador")

        db.session.add_all([
            state1, state2, state3, state4, state5, state6, state7,
            state8, state9, state10])
        db.session.commit()
        print("[OK] States seeded successfully!")
    except Exception as e:
        db.session.rollback()
        print(f"[ERROR] Error seeding states: {e}")
        raise

def undo_states():
    db.session.execute('TRUNCATE states RESTART IDENTITY CASCADE;')
    db.session.commit()
