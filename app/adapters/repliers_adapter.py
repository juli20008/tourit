"""
Repliers API → Tourit.ca StandardPropertySchema adapter.

This is the only file that knows about Repliers-specific field names.
To switch to TREB/CREA direct feeds, add a new adapter alongside this
one and update the sync service to call it instead.
"""
from datetime import datetime
from ..schemas.property_schema import StandardPropertySchema, StandardAgentSchema


def _parse_date(val: str) -> datetime | None:
    if not val:
        return None
    try:
        return datetime.fromisoformat(val.replace('Z', '+00:00').split('+')[0])
    except Exception:
        return None


def _truncate(val, length: int) -> str | None:
    s = (val or '')[:length]
    return s or None


def to_standard(raw: dict) -> StandardPropertySchema:
    """Transform a single raw Repliers listing dict into a StandardPropertySchema."""
    addr = raw.get('address') or {}
    geo = raw.get('map') or {}
    det = raw.get('details') or {}
    agents = raw.get('agents') or []
    office = raw.get('office') or {}

    first_agent = agents[0] if agents else {}
    brokerage_name = (
        (first_agent.get('brokerage') or {}).get('name')
        or office.get('brokerageName')
    )

    agent = StandardAgentSchema(
        name=_truncate(first_agent.get('name'), 100),
        email=_truncate(first_agent.get('email'), 255),
        brokerage=_truncate(brokerage_name, 200),
    )

    raw_lat = geo.get('latitude')
    raw_lng = geo.get('longitude')

    return StandardPropertySchema(
        source_id=raw.get('mlsNumber', ''),
        source='repliers',
        status=raw.get('status'),
        standard_status=raw.get('standardStatus'),
        property_class=raw.get('class'),
        transaction_type=raw.get('type'),
        list_price=raw.get('listPrice'),
        sold_price=raw.get('soldPrice'),
        original_price=raw.get('originalPrice'),
        list_date=_parse_date(raw.get('listDate')),
        sold_date=_parse_date(raw.get('soldDate')),
        last_status=raw.get('lastStatus'),
        street_number=_truncate(addr.get('streetNumber'), 20),
        street_name=_truncate(addr.get('streetName'), 100),
        street_suffix=_truncate(addr.get('streetSuffix'), 30),
        unit_number=_truncate(addr.get('unitNumber'), 20),
        city=_truncate(addr.get('city'), 100),
        state=_truncate(addr.get('state'), 10),
        zip_code=_truncate(addr.get('zip'), 15),
        country=_truncate(addr.get('country'), 10),
        neighborhood=_truncate(addr.get('neighborhood'), 100),
        latitude=float(raw_lat) if raw_lat is not None else None,
        longitude=float(raw_lng) if raw_lng is not None else None,
        bedrooms=det.get('numBedrooms'),
        bathrooms=det.get('numBathrooms'),
        sqft=_truncate(str(det.get('sqft') or ''), 20),
        year_built=_truncate(str(det.get('yearBuilt') or ''), 10),
        style=_truncate(det.get('style'), 100),
        property_type=_truncate(det.get('propertyType'), 50),
        description=det.get('description'),
        images=raw.get('images') or [],
        agent=agent,
    )
