from datetime import datetime
from .db import db


class LiveTour(db.Model):
    __tablename__ = "live_tours"

    id = db.Column(db.Integer, primary_key=True)
    agent_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    mls_number = db.Column(db.String(50), nullable=False, index=True)
    scheduled_at = db.Column(db.DateTime, nullable=False)  # UTC
    stream_url = db.Column(db.String(500), nullable=False)
    title = db.Column(db.String(200), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    agent = db.relationship("User", foreign_keys=[agent_id])

    def to_dict(self):
        return {
            "id": self.id,
            "agent_id": self.agent_id,
            "agent_name": self.agent.username if self.agent else None,
            "agent_photo": self.agent.photo if self.agent else None,
            "mls_number": self.mls_number,
            "scheduled_at": self.scheduled_at.isoformat() + "Z",
            "stream_url": self.stream_url,
            "title": self.title,
        }
