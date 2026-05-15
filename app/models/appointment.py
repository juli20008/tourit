from .db import db

class Appointment(db.Model):
    __tablename__ = "appointments"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    agent_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    property_id = db.Column(db.Integer, db.ForeignKey("properties.id"), nullable=True)
    mls_listing_id = db.Column(db.Integer, db.ForeignKey("mls_listings.id"), nullable=True)
    mls_number = db.Column(db.String(50), nullable=True)  # for listings whose id is non-integer
    date = db.Column(db.String(50), nullable=False)
    time = db.Column(db.String(50), nullable=False)
    message = db.Column(db.String(255))
    canceled = db.Column(db.Boolean)
    archived = db.Column(db.Boolean, default=False)

    user = db.relationship("User", foreign_keys=[user_id], back_populates="user_appointments")
    agent = db.relationship("User", foreign_keys=[agent_id], back_populates="agent_appointments")
    property = db.relationship("Property", back_populates="appointments")
    mls_listing = db.relationship("MlsListing", foreign_keys=[mls_listing_id])

    def to_dict(self):
        listing = None
        if self.property:
            imgs = self.property.images or []
            listing = {
                "street": self.property.street,
                "city": self.property.city,
                "state": self.property.state.state if self.property.state else "",
                "zip": self.property.zip,
                "image": imgs[0].img_url if imgs else self.property.front_img,
            }
        elif self.mls_listing:
            listing = {
                "street": self.mls_listing.street,
                "city": self.mls_listing.city or "",
                "state": self.mls_listing.state or "",
                "zip": self.mls_listing.zip or "",
                "image": self.mls_listing.front_img,
            }
        elif self.mls_number:
            from app.models.mls_listing import MlsListing
            ml = MlsListing.query.filter_by(mls_number=self.mls_number).first()
            if ml:
                listing = {
                    "street": ml.street,
                    "city": ml.city or "",
                    "state": ml.state or "",
                    "zip": ml.zip or "",
                    "image": ml.front_img,
                }

        return {
            "id": self.id,
            "user_id": self.user_id,
            "username": self.user.username,
            "email": self.user.email,
            "user_photo": self.user.photo,
            "agent_id": self.agent_id,
            "property_id": (f"mls_{self.mls_listing_id}" if self.mls_listing_id is not None
                            else f"mls_{self.mls_number}" if self.mls_number
                            else self.property_id),
            "mls_listing_id": self.mls_listing_id,
            "mls_number": self.mls_number,
            "date": self.date,
            "time": self.time,
            "message": self.message,
            "canceled": self.canceled,
            "archived": self.archived,
            "listing": listing,
        }

    def appt(self):
        return f"{self.date} {self.time}"
