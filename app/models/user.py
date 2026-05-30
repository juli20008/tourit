from .db import db

from sqlalchemy.exc import OperationalError
from werkzeug.security import generate_password_hash, check_password_hash
from flask_login import UserMixin


class User(db.Model, UserMixin):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(40), nullable=False)
    email = db.Column(db.String(255), nullable=False, unique=True)
    hashed_password = db.Column(db.String(255), nullable=True)
    google_id = db.Column(db.String(255), unique=True, nullable=True)
    phone = db.Column(db.String(40))
    agent = db.Column(db.Boolean(), default=False)
    license_num = db.Column(db.String(20))
    bio = db.Column(db.String(2000))
    photo = db.Column(db.String)
    broker_license = db.Column(db.String(40))
    office = db.Column(db.String(100))
    voice_sample_url = db.Column(db.String(500), nullable=True)
    elevenlabs_voice_id = db.Column(db.String(100), nullable=True)

    properties = db.relationship("Property", back_populates="listing_agent")
    areas = db.relationship("AgentArea", back_populates="agent")
    availabilities = db.relationship("AgentAvailability", back_populates="agent", cascade="all, delete-orphan")

    user_reviews = db.relationship("Review", back_populates="user", primaryjoin="User.id == Review.user_id")
    agent_reviews = db.relationship("Review", back_populates="agent", primaryjoin="User.id == Review.agent_id")

    user_appointments = db.relationship("Appointment", back_populates="user", primaryjoin="User.id == Appointment.user_id")
    agent_appointments = db.relationship("Appointment", back_populates="agent", primaryjoin="User.id == Appointment.agent_id")

    user_channels = db.relationship("Channel", back_populates="user", primaryjoin="User.id == Channel.user_id")
    agent_channels = db.relationship("Channel", back_populates="agent", primaryjoin="User.id == Channel.agent_id")

    chats = db.relationship("Chat", back_populates="user")

    @property
    def appointments(self):
        if self.agent:
            return self.agent_appointments
        else:
            return self.user_appointments

    @property
    def password(self):
        return self.hashed_password

    @password.setter
    def password(self, password):
        self.hashed_password = generate_password_hash(password)

    def check_password(self, password):
        if not self.hashed_password:
            return False
        return check_password_hash(self.hashed_password, password)

    def to_dict(self):
        if self.agent:
            avg_review_lst = [review.rating for review in self.agent_reviews]
            if len(avg_review_lst):
                avg = sum(avg_review_lst) / len(avg_review_lst)
            else:
                avg = 0

            reviews = [review.to_dict() for review in self.agent_reviews]

            if len(reviews) > 0:
                recent_review = reviews[-1]["content"]

                if not recent_review:

                    i = len(reviews) - 2
                    for i in range(len(reviews)):
                        if reviews[i]["content"] != "":
                            recent_review = reviews[i]["content"]
                            break
                        else:
                            i -= 1

            else:
                recent_review = ""


            # Batch all Canadian FSA lookups into one query instead of N.
            from .agent_area import _FSA_CACHE
            canadian = [(a, a.zip[:3].upper()) for a in self.areas if a.zip and len(a.zip) <= 3]
            other    = [a for a in self.areas if not (a.zip and len(a.zip) <= 3)]
            uncached = [fsa for _, fsa in canadian if fsa not in _FSA_CACHE]
            if uncached:
                try:
                    from .mls_listing import MlsListing
                    rows = (
                        MlsListing.query
                        .filter(db.or_(*[MlsListing.zip.ilike(f"{fsa}%") for fsa in set(uncached)]))
                        .with_entities(MlsListing.zip, MlsListing.city)
                        .all()
                    )
                    for r in rows:
                        if r.zip and r.city:
                            k = r.zip[:3].upper()
                            bucket = _FSA_CACHE.setdefault(k, [])
                            if r.city not in bucket and len(bucket) < 5:
                                bucket.append(r.city)
                    for fsa in uncached:
                        _FSA_CACHE.setdefault(fsa, [])
                except Exception:
                    pass
            areas = (
                [{"zip": a.zip, "cities": _FSA_CACHE.get(fsa, [])} for a, fsa in canadian]
                + [a.city() for a in other]
            )

            try:
                availability = [availability.to_dict() for availability in self.availabilities]
            except OperationalError:
                availability = []

            return {
                'id': self.id,
                'username': self.username,
                'email': self.email,
                "phone": self.phone,
                "agent": self.agent,
                "license_num": self.license_num,
                "bio" : self.bio,
                "photo": self.photo,
                "broker_license": self.broker_license,
                "office": self.office,
                "recent_review": recent_review,
                "reviewIds" : [review.id for review in self.agent_reviews],
                "rating": round(avg, 1),
                "areas": areas,
                "availability": availability,
                "voice_sample_url": self.voice_sample_url,
                "has_voice": bool(self.elevenlabs_voice_id),
            }
        else:
            return {
                'id': self.id,
                'username': self.username,
                'email': self.email,
                "phone": self.phone,
                "photo": self.photo,
            }
