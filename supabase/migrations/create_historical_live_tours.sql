CREATE TABLE IF NOT EXISTS historical_live_tours (
    id SERIAL PRIMARY KEY,
    agent_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mls_number VARCHAR(50) NOT NULL,
    video_url VARCHAR(500) NOT NULL,
    title VARCHAR(200),
    created_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT uq_historical_agent_mls UNIQUE (agent_id, mls_number)
);

CREATE INDEX IF NOT EXISTS idx_hist_live_tours_mls ON historical_live_tours(mls_number);
