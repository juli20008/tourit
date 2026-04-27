from .db import db


class AgentAvailability(db.Model):
    __tablename__ = "agent_availabilities"

    id = db.Column(db.Integer, primary_key=True)
    agent_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    weekday = db.Column(db.Integer, nullable=False)
    start_time = db.Column(db.String(5), nullable=False)
    end_time = db.Column(db.String(5), nullable=False)

    agent = db.relationship("User", back_populates="availabilities")

    def to_dict(self):
        return {
            "id": self.id,
            "agent_id": self.agent_id,
            "weekday": self.weekday,
            "start_time": self.start_time,
            "end_time": self.end_time,
        }
