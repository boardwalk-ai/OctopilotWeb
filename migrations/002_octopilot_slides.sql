
-- OctopilotSlides: persistent, editable presentation decks.
-- Store complete DeckState as JSONB to preserve all slide elements.
-- Apply only through the team's approved database migration process.

CREATE TABLE IF NOT EXISTS slide_decks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    deck_id text NOT NULL,
    title text NOT NULL DEFAULT 'Untitled presentation',
    state jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT slide_decks_user_deck_unique UNIQUE (user_id, deck_id)
);

CREATE INDEX IF NOT EXISTS idx_slide_decks_user_updated
    ON slide_decks (user_id, updated_at DESC);

CREATE TRIGGER trg_slide_decks_updated
    BEFORE UPDATE ON slide_decks
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
