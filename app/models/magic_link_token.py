import secrets
from datetime import datetime, timedelta
from .db import db


class MagicLinkToken(db.Model):
    __tablename__ = 'magic_link_tokens'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer,
        db.ForeignKey('users.id', ondelete='CASCADE'),
        nullable=False,
    )
    token = db.Column(db.String(64), unique=True, nullable=False, index=True)
    expires_at = db.Column(db.DateTime, nullable=False)
    used = db.Column(db.Boolean, default=False, nullable=False)

    user = db.relationship('User', backref=db.backref('magic_tokens', lazy=True))

    @classmethod
    def create_for_user(cls, user_id):
        # Invalidate any previous unused tokens for this user before issuing a new one
        cls.query.filter_by(user_id=user_id, used=False).update({'used': True})
        token = secrets.token_urlsafe(32)
        record = cls(
            user_id=user_id,
            token=token,
            expires_at=datetime.utcnow() + timedelta(minutes=30),
        )
        db.session.add(record)
        db.session.commit()
        return token

    @classmethod
    def consume(cls, token_str):
        """Validate and consume a token. Returns the User on success, None on failure."""
        record = cls.query.filter_by(token=token_str, used=False).first()
        if not record or datetime.utcnow() > record.expires_at:
            return None
        record.used = True
        db.session.commit()
        return record.user
