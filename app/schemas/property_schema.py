"""
Tourit.ca canonical property and agent schemas.

All external data sources (Repliers, TREB, CREA, etc.) must be
transformed into these schemas before reaching the database layer.
Switching feeds means updating only the corresponding adapter.
"""
from dataclasses import dataclass, field
from typing import Optional, List
from datetime import datetime


@dataclass
class StandardAgentSchema:
    name: Optional[str] = None
    email: Optional[str] = None
    brokerage: Optional[str] = None


@dataclass
class StandardPropertySchema:
    # ── Identity ────────────────────────────────────────────────────────
    source_id: str = ''          # MLS number or feed-specific ID
    source: str = 'unknown'      # 'repliers' | 'treb' | 'crea' | ...

    # ── Transaction ─────────────────────────────────────────────────────
    status: Optional[str] = None             # feed-native code, e.g. 'A'
    standard_status: Optional[str] = None    # human-readable: 'Active', 'Sold'
    property_class: Optional[str] = None     # 'CondoProperty', 'ResidentialProperty'
    transaction_type: Optional[str] = None   # 'Sale' | 'Lease'

    # ── Pricing ──────────────────────────────────────────────────────────
    list_price: Optional[int] = None
    sold_price: Optional[int] = None
    original_price: Optional[int] = None
    list_date: Optional[datetime] = None
    sold_date: Optional[datetime] = None
    last_status: Optional[str] = None

    # ── Address ──────────────────────────────────────────────────────────
    street_number: Optional[str] = None
    street_name: Optional[str] = None
    street_suffix: Optional[str] = None
    unit_number: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    country: Optional[str] = None
    neighborhood: Optional[str] = None

    # ── Geolocation ──────────────────────────────────────────────────────
    latitude: Optional[float] = None
    longitude: Optional[float] = None

    # ── Property Details ─────────────────────────────────────────────────
    bedrooms: Optional[int] = None
    bathrooms: Optional[int] = None
    sqft: Optional[str] = None
    year_built: Optional[str] = None
    style: Optional[str] = None
    property_type: Optional[str] = None
    description: Optional[str] = None

    # ── Media ────────────────────────────────────────────────────────────
    images: List[str] = field(default_factory=list)

    # ── Realtor.ca CDN metadata ───────────────────────────────────────────
    external_id: Optional[str] = None      # e.g. 'n13019614'
    photos_timestamp: Optional[str] = None  # .NET ticks stored as string (never float)
    photos_count: Optional[int] = None

    # ── Agent / Brokerage (embedded in listing record) ───────────────────
    agent: Optional[StandardAgentSchema] = None
