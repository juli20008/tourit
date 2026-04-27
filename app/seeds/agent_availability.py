from app.models import db, User, AgentAvailability


def seed_agent_availability():
    AgentAvailability.__table__.create(bind=db.engine, checkfirst=True)

    db.session.query(AgentAvailability).delete()
    db.session.commit()

    agents = User.query.filter(User.agent == True).all()
    availability_rows = []

    for agent in agents:
        for weekday in range(5):
            availability_rows.append(
                AgentAvailability(
                    agent_id=agent.id,
                    weekday=weekday,
                    start_time="09:00",
                    end_time="17:00",
                )
            )

    db.session.add_all(availability_rows)
    db.session.commit()


def undo_agent_availability():
    db.session.query(AgentAvailability).delete()
    db.session.commit()
