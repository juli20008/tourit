"""
Enable Row Level Security on all public tables and create appropriate policies.

Design decisions:
- The Flask app connects as the postgres superuser via SESSION POOLER.
  Superusers bypass RLS automatically — no policy needed for the app to keep working.
- Public-read policies (anon role) are created for tables the frontend reads
  through Supabase's PostgREST layer or any future direct-SDK usage.
- Write/mutate operations come only from the Flask backend (postgres superuser),
  so no INSERT/UPDATE/DELETE policies are needed for anon/authenticated.
- alembic_version is internal; no user-facing policy needed.
"""
import sys
sys.stdout.reconfigure(encoding='utf-8')

from dotenv import load_dotenv
load_dotenv()

from app import app

# Tables where anon (unauthenticated) may SELECT — public catalogue data.
PUBLIC_READ = [
    'mls_listings',
    'properties',
    'property_imgs',
    'states',
    'zip_cities',
    'reviews',
    'agent_availabilities',
    'agent_areas',
    'mls_agents',
]

# Tables that hold user PII / session data — no public read.
# Flask (postgres superuser) still accesses them freely.
PRIVATE = [
    'users',
    'appointments',
    'channels',
    'chats',
]

# Internal migration table — enable RLS, no policies needed.
INTERNAL = ['alembic_version']

ALL_TABLES = PUBLIC_READ + PRIVATE + INTERNAL


def run():
    with app.app_context():
        from app.models.db import db

        print('=== Enabling RLS on all tables ===')
        for table in ALL_TABLES:
            db.session.execute(db.text(
                f'ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;'
            ))
            print(f'  RLS ON  → {table}')
        db.session.commit()

        print('\n=== Creating public-read (anon SELECT) policies ===')
        for table in PUBLIC_READ:
            policy_name = f'public_read_{table}'
            # Drop if exists so this script is idempotent
            db.session.execute(db.text(
                f'DROP POLICY IF EXISTS "{policy_name}" ON {table};'
            ))
            db.session.execute(db.text(f'''
                CREATE POLICY "{policy_name}"
                ON {table}
                FOR SELECT
                TO anon, authenticated
                USING (true);
            '''))
            print(f'  SELECT policy → {table}')
        db.session.commit()

        print('\n=== Verification ===')
        rows = db.session.execute(db.text('''
            SELECT t.tablename,
                   t.rowsecurity,
                   coalesce(string_agg(p.policyname, ', '), '(none)') AS policies
            FROM pg_tables t
            LEFT JOIN pg_policies p
                   ON p.tablename = t.tablename AND p.schemaname = 'public'
            WHERE t.schemaname = 'public'
            GROUP BY t.tablename, t.rowsecurity
            ORDER BY t.tablename
        ''')).fetchall()
        print(f'  {"TABLE":<25} {"RLS":>5}  POLICIES')
        print('  ' + '-' * 60)
        for tablename, rls, policies in rows:
            flag = '✓' if rls else '✗'
            print(f'  {tablename:<25} {flag:>5}  {policies}')

        print('\nDone.')


if __name__ == '__main__':
    run()
