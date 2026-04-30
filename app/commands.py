from flask.cli import AppGroup
from .services.repliers_sync import sync_listings

repliers_commands = AppGroup('repliers')


@repliers_commands.command('sync-listings')
def sync_listings_cmd():
    """Fetch listings from Repliers API and upsert into mls_listings table."""
    sync_listings(verbose=True)
