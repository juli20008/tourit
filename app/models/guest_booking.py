from datetime import datetime
from .db import db


class GuestBooking(db.Model):
    __tablename__ = "guest_bookings"

    id               = db.Column(db.Integer, primary_key=True)
    guest_id         = db.Column(db.String(64), nullable=False, unique=True, index=True)
    property_address = db.Column(db.String(255), nullable=False)
    property_image   = db.Column(db.String(500))
    mls_number       = db.Column(db.String(50))
    mls_listing_id   = db.Column(db.Integer)
    property_id      = db.Column(db.Integer)
    date             = db.Column(db.String(50), nullable=False)
    time             = db.Column(db.String(50), nullable=False)
    phone            = db.Column(db.String(50))
    email            = db.Column(db.String(255))
    # pending = booked, no contact info yet
    # lead    = contact info captured
    status     = db.Column(db.String(20), nullable=False, default="pending")
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id":               self.id,
            "guest_id":         self.guest_id,
            "property_address": self.property_address,
            "date":             self.date,
            "time":             self.time,
            "phone":            self.phone,
            "email":            self.email,
            "status":           self.status,
            "created_at":       self.created_at.isoformat() if self.created_at else None,
        }
