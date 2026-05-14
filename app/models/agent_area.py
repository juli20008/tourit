from .db import db
from .property import Property
from .zip_city import ZipCity

# Process-level FSA→cities cache: populated on first lookup, lives for the
# lifetime of the worker. Cities for a given FSA don't change between deploys.
_FSA_CACHE: dict = {}


class AgentArea(db.Model):
    __tablename__ = "agent_areas"

    id = db.Column(db.Integer, primary_key=True)
    agent_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    zip = db.Column(db.String(7), nullable=False)

    agent = db.relationship("User", back_populates="areas")

    def city(self):
        fsa = self.zip[:3].upper() if self.zip else ""

        # For Canadian FSAs (3 chars): look up cities from MLS listings whose
        # postal code starts with this FSA, since ZipCity only covers US zips.
        if len(self.zip) <= 3 and fsa:
            if fsa in _FSA_CACHE:
                return {"zip": self.zip, "cities": _FSA_CACHE[fsa]}
            try:
                from .mls_listing import MlsListing
                rows = (
                    MlsListing.query
                    .filter(MlsListing.zip.ilike(f"{fsa}%"))
                    .with_entities(MlsListing.city)
                    .distinct()
                    .limit(5)
                    .all()
                )
                cities = [r.city for r in rows if r.city]
                _FSA_CACHE[fsa] = cities
                return {"zip": self.zip, "cities": cities}
            except Exception:
                pass
            _FSA_CACHE[fsa] = []
            return {"zip": self.zip, "cities": []}

        # Full postal code or US zip — original lookup path
        cities = ZipCity.query.filter(ZipCity.zip == self.zip).all()
        cities_lst = [city.city for city in cities]

        if not cities_lst:
            properties = Property.query.filter(Property.zip == self.zip).all()
            more_cities = [prop.city for prop in properties]
            cities_lst = list(set(more_cities))

        return {"zip": self.zip, "cities": cities_lst}
