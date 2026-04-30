import time
import requests
from datetime import datetime
from flask import current_app
from sqlalchemy.dialects.postgresql import insert as pg_insert

from ..models.db import db
from ..models.mls_listing import MlsListing
from ..adapters.repliers_adapter import to_standard, _as_ticks_str, _truncate
from ..schemas.property_schema import StandardPropertySchema

REPLIERS_BASE_URL = 'https://csr-api.repliers.io'
BATCH_SIZE = 100
REQUEST_DELAY = 0.3


def _get_headers():
    api_key = current_app.config.get('REPLIERS_API_KEY')
    return {'REPLIERS-API-KEY': api_key}


def _fetch_page(page_num, results_per_page=BATCH_SIZE, retries=3):
    url = f'{REPLIERS_BASE_URL}/listings'
    params = {'pageNum': page_num, 'resultsPerPage': results_per_page}
    for attempt in range(retries):
        try:
            resp = requests.get(url, headers=_get_headers(), params=params, timeout=30)
            resp.raise_for_status()
            data = resp.json()
            if isinstance(data, list):
                raise RuntimeError(f'Repliers API error: {data}')
            return data
        except requests.exceptions.HTTPError as e:
            if attempt < retries - 1 and e.response.status_code in (429, 500, 502, 503, 504):
                wait = 5 * (attempt + 1)
                print(f' [retry {attempt+1}/{retries-1} in {wait}s]', end=' ', flush=True)
                time.sleep(wait)
            else:
                raise


def _to_db_dict(schema: StandardPropertySchema) -> dict:
    """Map Tourit.ca's StandardPropertySchema to the mls_listings table row dict."""
    return {
        'mls_number': schema.source_id,
        'status': schema.status,
        'standard_status': schema.standard_status,
        'property_class': schema.property_class,
        'transaction_type': schema.transaction_type,
        'list_price': schema.list_price,
        'sold_price': schema.sold_price,
        'original_price': schema.original_price,
        'list_date': schema.list_date,
        'sold_date': schema.sold_date,
        'last_status': schema.last_status,
        'street_number': schema.street_number,
        'street_name': schema.street_name,
        'street_suffix': schema.street_suffix,
        'unit_number': schema.unit_number,
        'city': schema.city,
        'state': schema.state,
        'zip': schema.zip_code,
        'country': schema.country,
        'neighborhood': schema.neighborhood,
        'lat': schema.latitude,
        'lng': schema.longitude,
        'bed': schema.bedrooms,
        'bath': schema.bathrooms,
        'sqft': schema.sqft,
        'year_built': schema.year_built,
        'style': schema.style,
        'property_type': schema.property_type,
        'description': schema.description,
        'images': schema.images,
        # CDN fields — stored as TEXT to preserve 18-digit .NET tick precision
        'external_id': schema.external_id,
        'photos_timestamp': schema.photos_timestamp,
        'photos_count': schema.photos_count,
        'agent_name': schema.agent.name if schema.agent else None,
        'agent_email': schema.agent.email if schema.agent else None,
        'brokerage': schema.agent.brokerage if schema.agent else None,
        'updated_at': datetime.utcnow(),
    }


def _upsert_batch(batch: list[dict]) -> int:
    if not batch:
        return 0
    stmt = pg_insert(MlsListing).values(batch)
    stmt = stmt.on_conflict_do_update(
        index_elements=['mls_number'],
        set_={
            c: getattr(stmt.excluded, c)
            for c in batch[0].keys()
            if c != 'mls_number'
        }
    )
    db.session.execute(stmt)
    db.session.commit()
    return len(batch)


def resync_cdn_fields(max_pages=None, verbose=True):
    """Re-fetch every DDF listing from Repliers and write ONLY the CDN columns.

    Use this to recover from corrupted photos_timestamp values without
    doing a full re-sync of all 80+ columns.  Safe to re-run.
    """
    first_page = _fetch_page(1, results_per_page=BATCH_SIZE)
    num_pages = first_page.get('numPages', 1)
    total_count = first_page.get('count', 0)
    if max_pages:
        num_pages = min(num_pages, max_pages)

    if verbose:
        print(f'[repliers:cdn] {total_count:,} listings, '
              f'{num_pages:,} pages — updating CDN fields only')

    total_updated = 0

    def _process_cdn(page, data):
        raw_listings = data.get('listings') or []
        rows = []
        for r in raw_listings:
            mls = r.get('mlsNumber')
            if not mls:
                continue
            rows.append({
                'mls_number': mls,
                'external_id': _truncate(str(r.get('externalId') or ''), 100) or None,
                'photos_timestamp': _as_ticks_str(r.get('photosTimestamp')),
                'photos_count': r.get('numPhotos') or r.get('photosCount'),
            })
        if not rows:
            return 0
        stmt = pg_insert(MlsListing).values(rows)
        stmt = stmt.on_conflict_do_update(
            index_elements=['mls_number'],
            set_={
                'external_id': stmt.excluded.external_id,
                'photos_timestamp': stmt.excluded.photos_timestamp,
                'photos_count': stmt.excluded.photos_count,
            }
        )
        db.session.execute(stmt)
        db.session.commit()
        return len(rows)

    total_updated += _process_cdn(1, first_page)

    for page in range(2, num_pages + 1):
        if verbose:
            print(f'[repliers:cdn] page {page}/{num_pages}...', end=' ', flush=True)
        time.sleep(REQUEST_DELAY)
        data = _fetch_page(page)
        n = _process_cdn(page, data)
        total_updated += n
        if verbose:
            print(f'{n} updated  (total: {total_updated})')

    if verbose:
        print(f'[repliers:cdn] Done — {total_updated:,} CDN rows refreshed.')
    return total_updated


def sync_listings(max_pages=None, start_page=1, verbose=True):
    """
    Fetch listings from Repliers, adapt through StandardPropertySchema,
    and UPSERT into mls_listings. Safe to re-run. Returns total rows upserted.

    Use start_page to resume an interrupted sync without re-processing
    pages that already completed.
    """
    first_page = _fetch_page(1, results_per_page=BATCH_SIZE)
    num_pages = first_page.get('numPages', 1)
    total_count = first_page.get('count', 0)

    if max_pages:
        num_pages = min(num_pages, max_pages)

    if verbose:
        print(f'[repliers] {total_count:,} listings, '
              f'{first_page.get("numPages"):,} total pages at batch={BATCH_SIZE} '
              f'(syncing pages {start_page}–{num_pages})')

    total_upserted = 0

    def _process(page, data):
        raw_listings = data.get('listings') or []
        batch = [
            _to_db_dict(to_standard(r))
            for r in raw_listings
            if r.get('mlsNumber')
        ]
        count = _upsert_batch(batch)
        if verbose:
            print(f'[repliers] page {page}/{num_pages}: {count} upserted  '
                  f'(total: {total_upserted + count})')
        return count

    if start_page == 1:
        total_upserted += _process(1, first_page)
        start_page = 2

    for page in range(start_page, num_pages + 1):
        if verbose:
            print(f'[repliers] fetching page {page}/{num_pages}...', end=' ', flush=True)
        time.sleep(REQUEST_DELAY)
        data = _fetch_page(page)
        total_upserted += _process(page, data)

    if verbose:
        print(f'[repliers] Done — {total_upserted:,} total rows upserted.')

    return total_upserted
