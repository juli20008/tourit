-- Live tours: agents schedule open-house style livestreams on a listing
CREATE TABLE IF NOT EXISTS live_tours (
    id          SERIAL PRIMARY KEY,
    agent_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mls_number  VARCHAR(50) NOT NULL,
    scheduled_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    stream_url  VARCHAR(500) NOT NULL,
    title       VARCHAR(200),
    created_at  TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS live_tours_mls_number_idx ON live_tours (mls_number);
CREATE INDEX IF NOT EXISTS live_tours_scheduled_at_idx ON live_tours (scheduled_at);
