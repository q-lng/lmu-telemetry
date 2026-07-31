-- Generic per-user preferences store: one JSONB blob per user, PUT does a
-- shallow merge of new top-level keys into it rather than a full replace, so
-- unrelated features can each own their own key without clobbering others.
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data       JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
