from .db import db
from datetime import datetime
from decimal import Decimal, InvalidOperation
from sqlalchemy.dialects.postgresql import JSONB

_CDN_BASE = "https://ddfcdn.realtor.ca/listings"


def _normalize_ticks(photos_timestamp) -> str | None:
    """Convert photos_timestamp to a precise integer string.

    The value is stored as a VARCHAR (e.g. '639124508855930000') but may
    arrive as scientific notation (e.g. '6.3912e+17') if a numeric DB type
    was used elsewhere.  Decimal avoids the precision loss that float causes
    for 18-digit .NET tick values.
    """
    if not photos_timestamp:
        return None
    s = str(photos_timestamp).strip()
    # Fast path — already a clean integer string
    if s.lstrip('-').isdigit():
        return s
    # Strip trailing decimal with no fractional part (e.g. "639...000.0")
    if '.' in s and 'e' not in s.lower():
        s = s.split('.')[0]
        if s.lstrip('-').isdigit():
            return s
    # Scientific notation or mixed — use Decimal for lossless conversion
    try:
        return str(int(Decimal(s)))
    except (InvalidOperation, ValueError, OverflowError):
        return None


def _build_cdn_image_url(external_id, photos_timestamp, index=1):
    """Build a Realtor.ca CDN image URL.

    Pattern: https://cdn.realtor.ca/listings/TS{ticks}/reb82/highres/4/{eid}_{n}.jpg
    """
    if not external_id or not photos_timestamp:
        return None
    ts = _normalize_ticks(photos_timestamp)
    if not ts:
        return None
    eid = str(external_id).lower()
    return f"{_CDN_BASE}/TS{ts}/reb82/highres/4/{eid}_{index}.jpg"


class MlsListing(db.Model):
    __tablename__ = 'mls_listings'

    id = db.Column(db.Integer, primary_key=True)
    mls_number = db.Column(db.String(50), nullable=False, unique=True)
    status = db.Column(db.String(20), index=True)          # A, U, etc.
    standard_status = db.Column(db.String(30))             # Active, Sold, etc.
    property_class = db.Column(db.String(50))              # CondoProperty, etc.
    transaction_type = db.Column(db.String(20))            # Sale / Lease

    list_price = db.Column(db.Integer, index=True)
    sold_price = db.Column(db.Integer)
    original_price = db.Column(db.Integer)
    list_date = db.Column(db.DateTime)
    sold_date = db.Column(db.DateTime)
    last_status = db.Column(db.String(50))

    # Address
    street_number = db.Column(db.String(20))
    street_name = db.Column(db.String(100))
    street_suffix = db.Column(db.String(30))
    unit_number = db.Column(db.String(20))
    city = db.Column(db.String(100), index=True)
    state = db.Column(db.String(10))
    zip = db.Column(db.String(15))
    country = db.Column(db.String(10))
    neighborhood = db.Column(db.String(100))

    # Geo — NUMERIC for precise range queries
    lat = db.Column(db.Numeric(10, 7))
    lng = db.Column(db.Numeric(10, 7))

    # Property details
    bed = db.Column(db.Integer, index=True)
    bath = db.Column(db.Integer)
    sqft = db.Column(db.String(20))
    year_built = db.Column(db.String(10))
    style = db.Column(db.String(100))
    property_type = db.Column(db.String(50))
    description = db.Column(db.Text)

    # Images stored as JSON array (raw/stored)
    images = db.Column(JSONB, default=list)

    # Realtor.ca CDN metadata — used to build image URLs on the fly
    external_id = db.Column(db.String(100), nullable=True, index=True)
    photos_timestamp = db.Column(db.Text, nullable=True)  # .NET ticks — TEXT avoids VARCHAR length constraints
    photos_count = db.Column(db.Integer, nullable=True)

    association_fee = db.Column(db.Numeric(10, 2), nullable=True)
    association_fee_frequency = db.Column(db.String(30), nullable=True)
    lot_frontage = db.Column(db.String(50), nullable=True)
    lot_size_area = db.Column(db.Numeric(12, 2), nullable=True)
    construction_materials = db.Column(db.Text, nullable=True)
    levels = db.Column(db.String(20), nullable=True)
    ownership_type = db.Column(db.String(50), nullable=True)

    # Agent / brokerage
    agent_name = db.Column(db.String(100))
    agent_email = db.Column(db.String(255))
    brokerage = db.Column(db.String(200))

    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow,
                           onupdate=datetime.utcnow)

    @property
    def street(self):
        parts = filter(None, [self.street_number, self.street_name, self.street_suffix])
        return ' '.join(parts)

    @property
    def cdn_image_urls(self):
        """Generate Realtor.ca CDN URLs for all photos using external_id + photos_timestamp.

        Produces: https://cdn.realtor.ca/listings/TS{ticks}/reb82/highres/4/{eid}_{n}.jpg
        """
        if not self.external_id or not self.photos_timestamp:
            return []
        count = max(self.photos_count or 1, 1)
        urls = []
        for i in range(1, count + 1):
            url = _build_cdn_image_url(self.external_id, self.photos_timestamp, i)
            if url:
                urls.append(url)
        return urls

    @property
    def effective_images(self):
        """Return the best available image list.

        Priority:
        1. Stored images if they contain real (non-sample) URLs.
        2. Dynamically generated Realtor.ca CDN URLs.
        3. Empty list (fallback; UI should show placeholder).
        """
        stored = self.images or []
        real = [img for img in stored if img and not str(img).startswith('sample/')]
        if real:
            return real
        return self.cdn_image_urls

    @property
    def front_img(self):
        imgs = self.effective_images
        return imgs[0] if imgs else None

    @property
    def image_url(self):
        """First image URL for this listing (CDN-generated or stored).

        Returns the _1.jpg CDN URL when external_id + photos_timestamp are
        available, falling back to the first stored image, then None.
        """
        return self.front_img

    def _sqft_int(self):
        """Return sqft as int for price/sqft calc; None if unparseable."""
        try:
            return int(self.sqft) if self.sqft else None
        except (ValueError, TypeError):
            return None

    def _base_frontend_dict(self):
        imgs = self.effective_images
        sqft_int = self._sqft_int()
        return {
            'id': f'mls_{self.id}',
            'is_mls': True,
            'mls_number': self.mls_number,
            'status': self.standard_status or self.status or 'Active',
            'type': self.style or self.property_type or self.transaction_type or '',
            'style': self.style or '',
            'property_type': self.property_type or '',
            'transaction_type': self.transaction_type or '',
            'property_class': self.property_class or '',
            'price': self.list_price or 0,
            'sold_price': self.sold_price,
            'original_price': self.original_price,
            'bed': self.bed or 0,
            'bath': float(self.bath) if self.bath is not None else 0,
            'sqft': sqft_int,
            'lot': None,
            'built': self.year_built,
            'garage': None,
            'street': self.street,
            'unit': self.unit_number or '',
            'city': self.city or '',
            'state': self.state or '',
            'zip': self.zip or '',
            'neighborhood': self.neighborhood or '',
            'listing_id': self.mls_number,
            'listing_date': self.list_date.date().isoformat() if self.list_date else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'description': self.description,
            'listing_agent_id': None,
            'office': self.brokerage or '',
            'brokerage': self.brokerage or '',
            'agent_name': self.agent_name,
            'agent_email': self.agent_email or '',
            'front_img': imgs[0] if imgs else None,
            'image_url': imgs[0] if imgs else None,
            'images': imgs,
            'image_urls': imgs,
            'lat': float(self.lat) if self.lat is not None else None,
            'lng': float(self.lng) if self.lng is not None else None,
            'association_fee': float(self.association_fee) if self.association_fee is not None else None,
            'association_fee_frequency': self.association_fee_frequency or None,
            'lot_frontage': self.lot_frontage or None,
            'lot_size_area': float(self.lot_size_area) if self.lot_size_area is not None else None,
            'construction_materials': self.construction_materials or None,
            'levels': self.levels or None,
            'ownership_type': self.ownership_type or None,
        }

    def to_frontend_dict(self):
        """
        Shape that matches Property.to_dict() so the existing React
        components render MLS listings without modification.

        Key decisions:
        - id prefixed 'mls_<id>' avoids collision with seeded property IDs.
        - type uses style (e.g. 'Single Family Residence', 'Townhouse',
          'Condominium') so the UI dropdown filter works via .includes().
        - image_urls carries CDN URLs when images[] is empty; [] signals no
          stored PropertyImg IDs.
        - listing_agent_id is null — Property/index.js guards this.
        """
        return self._base_frontend_dict()

    def to_frontend_light_dict(self):
        data = self._base_frontend_dict()
        data.pop('description', None)
        data.pop('images', None)
        data.pop('image_urls', None)
        return data

    def to_dict(self):
        imgs = self.effective_images
        return {
            'id': self.id,
            'mls_number': self.mls_number,
            'status': self.standard_status or self.status,
            'type': self.transaction_type,
            'class': self.property_class,
            'price': self.list_price,
            'sold_price': self.sold_price,
            'list_date': self.list_date.isoformat() if self.list_date else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'street': self.street,
            'unit': self.unit_number,
            'city': self.city,
            'state': self.state,
            'zip': self.zip,
            'country': self.country,
            'neighborhood': self.neighborhood,
            'lat': float(self.lat) if self.lat is not None else None,
            'lng': float(self.lng) if self.lng is not None else None,
            'bed': self.bed,
            'bath': self.bath,
            'sqft': self.sqft,
            'year_built': self.year_built,
            'style': self.style,
            'property_type': self.property_type,
            'description': self.description,
            'front_img': self.front_img,
            'images': imgs,
            'image_urls': imgs,
            'agent_name': self.agent_name,
            'brokerage': self.brokerage,
        }
