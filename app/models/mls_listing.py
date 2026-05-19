from .db import db
from datetime import datetime
from decimal import Decimal, InvalidOperation
from sqlalchemy import func, or_
from sqlalchemy.dialects.postgresql import JSONB

_CDN_BASE = "https://ddfcdn.realtor.ca/listings"


def _determine_category(property_class, unit_number):
    if str(property_class or '') == '300':
        unit = str(unit_number or '').strip()
        if unit and unit.lower() != 'nan':
            return 'Condo'
        return 'House'
    return 'Other'


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
    bath_half = db.Column(db.Integer, nullable=True)
    beds_above_grade = db.Column(db.Integer, nullable=True)
    basement_beds = db.Column(db.Integer, nullable=True)
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
    category = db.Column(db.String(50), nullable=True) # <-- 增加这一行
    # Agent / brokerage
    agent_name = db.Column(db.String(100))

    @classmethod
    def has_photos_filter(cls):
        """Filter: listing has stored photos OR CDN metadata to construct URLs."""
        has_stored = (cls.images.isnot(None)) & (func.jsonb_array_length(cls.images) > 0)
        has_cdn    = (cls.external_id.isnot(None)) & (cls.photos_timestamp.isnot(None))
        return has_stored | has_cdn

    @classmethod
    def is_active_filter(cls):
        """Filter: listing is not explicitly deactivated/sold/expired."""
        inactive_statuses = ['Inactive', 'Sold', 'Expired', 'Cancelled', 'Withdrawn']
        return or_(
            cls.standard_status.is_(None),
            cls.standard_status.notin_(inactive_statuses),
        )

    @classmethod
    def property_type_filter(cls):
        """Only show Residential / Single Family / Condo listings; pass through nulls.

        DDF stores PropertyType as numeric codes (300=Residential, 301=ResidentialCondo,
        302=Recreational). Older RETS-loaded rows may have text values. Accept both.
        Explicitly exclude 303 (Land), 304/305 (Commercial).
        """
        return or_(
            cls.property_type.is_(None),
            cls.property_type.ilike('%Residential%'),
            cls.property_type.ilike('%Single Family%'),
            cls.property_type.ilike('%Condo%'),
            cls.property_type.in_(['300', '301', '302']),
        )

    @classmethod
    def map_pin_filter(cls):
        """Filter for map pins: active + has coordinates. No photos required —
        photos are a display concern, not a visibility gate."""
        from sqlalchemy import and_
        return and_(
            cls.is_active_filter(),
            cls.lat.isnot(None),
            cls.lng.isnot(None),
            cls.list_price.isnot(None),
        )

    @classmethod
    def visible_filter(cls):
        """Combined filter for list view: has photos and is still active."""
        from sqlalchemy import and_
        return and_(cls.has_photos_filter(), cls.is_active_filter())
    agent_email = db.Column(db.String(255))
    brokerage = db.Column(db.String(200))

    last_seen_at = db.Column(db.DateTime, nullable=True)

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
        real = [img for img in stored if img and not str(img).startswith('sample/') and 'unsplash.com' not in str(img)]
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
        """Return sqft as int for single values, raw string for ranges, None if absent."""
        if not self.sqft:
            return None
        s = str(self.sqft)
        if '-' in s:
            return s  # range like "1500-2000" — pass through to frontend
        try:
            return int(s)
        except (ValueError, TypeError):
            return None

    def _first_image(self):
        """Return the first usable image URL without building the full list."""
        for img in (self.images or []):
            if img and not str(img).startswith('sample/') and 'unsplash.com' not in str(img):
                return img
        return _build_cdn_image_url(self.external_id, self.photos_timestamp, 1)

    def _base_frontend_dict(self):
        imgs = self.effective_images
        sqft_int = self._sqft_int()
        category = _determine_category(self.property_class, self.unit_number)
        return {
            'id': f'mls_{self.id}',
            'is_mls': True,
            'mls_number': self.mls_number,
            'status': self.standard_status or self.status or 'Active',
            'category': category,
            'type': category,
            'style': self.style or '',
            'property_type': self.property_type or '',
            'transaction_type': self.transaction_type or 'For Sale',
            'property_class': self.property_class or '',
            'price': self.list_price or 0,
            'sold_price': self.sold_price,
            'original_price': self.original_price,
            'bed': self.bed or 0,
            'bath': float(self.bath) if self.bath is not None else 0,
            'bath_half': self.bath_half or 0,
            'beds_above_grade': self.beds_above_grade,
            'basement_beds': self.basement_beds,
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

    def to_map_pin_dict(self):
        """Minimal payload for map pins and list cards.

        Fields intentionally omitted (hydrated on click via /api/listings/<mls>):
        description, images, image_urls, style, property_type, property_class,
        sold_price, original_price, lot, built, garage, neighborhood,
        listing_id, listing_date, updated_at, listing_agent_id, agent_name,
        agent_email, association_fee, association_fee_frequency, lot_frontage,
        lot_size_area, construction_materials, levels, ownership_type.
        """
        front = self._first_image()
        cat   = _determine_category(self.property_class, self.unit_number)
        return {
            'id':               f'mls_{self.id}',
            'is_mls':           True,
            'mls_number':       self.mls_number,
            'lat':              float(self.lat) if self.lat is not None else None,
            'lng':              float(self.lng) if self.lng is not None else None,
            'price':            self.list_price or 0,
            'bed':              self.bed or 0,
            'bath':             float(self.bath) if self.bath is not None else 0,
            'sqft':             self._sqft_int(),
            'street':           self.street,
            'unit':             self.unit_number or '',
            'city':             self.city or '',
            'state':            self.state or '',
            'zip':              self.zip or '',
            'status':           self.standard_status or self.status or 'Active',
            'category':         cat,
            'type':             cat,
            'transaction_type': self.transaction_type or 'For Sale',
            'brokerage':        self.brokerage or '',
            'office':           self.brokerage or '',
            'front_img':        front,
            'image_url':        front,
            'ownership_type':   self.ownership_type or None,
        }

    def to_address_index_dict(self):
        """Minimal payload for client-side address autocomplete index."""
        front = self._first_image()
        cat   = _determine_category(self.property_class, self.unit_number)
        return {
            'id':               f'mls_{self.id}',
            'mls_number':       self.mls_number,
            'street':           self.street,
            'unit':             self.unit_number or '',
            'city':             self.city or '',
            'price':            self.list_price or 0,
            'bed':              self.bed or 0,
            'bath':             float(self.bath) if self.bath is not None else 0,
            'category':         cat,
            'front_img':        front,
            'lat':              float(self.lat) if self.lat is not None else None,
            'lng':              float(self.lng) if self.lng is not None else None,
            'transaction_type': self.transaction_type or 'For Sale',
        }

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
            'category': self.category,
        }
