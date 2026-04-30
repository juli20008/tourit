from flask.cli import AppGroup
from .services.repliers_sync import sync_listings, resync_cdn_fields

repliers_commands = AppGroup('repliers')


@repliers_commands.command('sync-listings')
def sync_listings_cmd():
    """Fetch listings from Repliers API and upsert into mls_listings table."""
    sync_listings(verbose=True)


@repliers_commands.command('resync-cdn-fields')
def resync_cdn_fields_cmd():
    """Re-fetch CDN metadata (external_id, photos_timestamp, photos_count) for all DDF rows.

    Use this to fix corrupted photos_timestamp values without re-syncing all columns.
    """
    resync_cdn_fields(verbose=True)
