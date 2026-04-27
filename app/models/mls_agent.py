from .db import db
from datetime import datetime


class MlsAgent(db.Model):
    __tablename__ = 'mls_agents'

    id = db.Column(db.Integer, primary_key=True)
    repliers_id = db.Column(db.String(50), nullable=False, unique=True)
    first_name = db.Column(db.String(100))
    last_name = db.Column(db.String(100))
    full_name = db.Column(db.String(200), index=True)
    license_id = db.Column(db.String(50), index=True)
    email = db.Column(db.String(255))
    phone = db.Column(db.String(50))
    city = db.Column(db.String(100), index=True)
    province = db.Column(db.String(10))
    office = db.Column(db.String(200))
    position = db.Column(db.String(100))
    photo_url = db.Column(db.String(500))
    # NUMERIC(10,7) gives ~1cm precision, efficient for geo range queries
    lat = db.Column(db.Numeric(10, 7))
    lng = db.Column(db.Numeric(10, 7))
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow,
                           onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'repliers_id': self.repliers_id,
            'name': self.full_name,
            'first_name': self.first_name,
            'last_name': self.last_name,
            'license_id': self.license_id,
            'email': self.email,
            'phone': self.phone,
            'city': self.city,
            'province': self.province,
            'office': self.office,
            'position': self.position,
            'photo_url': self.photo_url,
            'lat': float(self.lat) if self.lat is not None else None,
            'lng': float(self.lng) if self.lng is not None else None,
        }
