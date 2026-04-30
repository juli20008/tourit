-- Enable extensions required for scheduled HTTP calls
CREATE EXTENSION IF NOT EXISTS pg_net  WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA cron;

-- Sync log table — records every Edge Function run (success or failure)
CREATE TABLE IF NOT EXISTS sync_logs (
    id              BIGSERIAL PRIMARY KEY,
    function_name   TEXT        NOT NULL,
    status          TEXT        NOT NULL CHECK (status IN ('success', 'error')),
    rows_upserted   INTEGER     NOT NULL DEFAULT 0,
    pages_processed INTEGER     NOT NULL DEFAULT 0,
    error_message   TEXT,
    started_at      TIMESTAMPTZ NOT NULL,
    finished_at     TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_logs_function_name
    ON sync_logs (function_name, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- BEFORE running the cron schedule below, execute these two statements once
-- in the Supabase SQL Editor (replace the placeholder values):
--
--   ALTER DATABASE postgres SET app.supabase_url = 'https://nrlkgzitxsclzasyofkp.supabase.co';
--   ALTER DATABASE postgres SET app.supabase_service_role_key = '<your-service-role-key>';
--
-- These are stored as database-level GUC settings and are never exposed in
-- logs or in the pg_cron job definition itself.
-- ─────────────────────────────────────────────────────────────────────────────

-- Remove any existing schedule with the same name before re-creating it
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'update-ontario-listings-daily') THEN
        PERFORM cron.unschedule('update-ontario-listings-daily');
    END IF;
END;
$$;

-- Daily Ontario listings sync — 08:00 UTC = 03:00 EST / 04:00 EDT
SELECT cron.schedule(
    'update-ontario-listings-daily',
    '0 8 * * *',
    $$
    SELECT
        net.http_post(
            url     := current_setting('app.supabase_url') || '/functions/v1/update-ontario-listings',
            headers := jsonb_build_object(
                'Content-Type',  'application/json',
                'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
            ),
            body    := '{}'::jsonb
        ) AS request_id
    $$
);
