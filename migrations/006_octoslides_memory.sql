-- OctoSlides long-term memory: durable facts about a user (brand, taste, constraints).
-- Ananta's model: one active fact per slot; a changed fact supersedes the old one,
-- which is kept (with the time it was replaced) so the designer can see the change.
CREATE TABLE IF NOT EXISTS octoslides_memory (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL,
  slot          text NOT NULL,
  predicate     text NOT NULL,
  object        text NOT NULL,
  polarity      smallint NOT NULL DEFAULT 1 CHECK (polarity IN (1, -1)),
  note          text,
  source        text NOT NULL DEFAULT 'agent' CHECK (source IN ('agent', 'user')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  confirmed_at  timestamptz NOT NULL DEFAULT now(),
  superseded_at timestamptz,
  superseded_by uuid
);
CREATE INDEX IF NOT EXISTS octoslides_memory_active ON octoslides_memory (user_id, slot) WHERE superseded_at IS NULL;
CREATE INDEX IF NOT EXISTS octoslides_memory_user ON octoslides_memory (user_id, created_at DESC);
