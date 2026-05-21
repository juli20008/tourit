from datetime import datetime
from .db import db


class HistoricalLiveTour(db.Model):
    __tablename__ = "historical_live_tours"
    __table_args__ = (
        db.UniqueConstraint("agent_id", "mls_number", name="uq_historical_agent_mls"),
    )

    id = db.Column(db.Integer, primary_key=True)
    agent_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    mls_number = db.Column(db.String(50), nullable=False, index=True)
    video_url = db.Column(db.String(500), nullable=False)
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
            "video_url": self.video_url,
            "title": self.title,
            "created_at": self.created_at.isoformat() + "Z",
        }
