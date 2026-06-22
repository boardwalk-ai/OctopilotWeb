-- Save Deck schema (hybrid: documents.state JSONB for 100% fidelity restore +
-- normalized child tables for sources / outlines / bullets).
-- Applied to the octopilot Postgres DB. Idempotent.
--
-- user_id holds users.id (resolved from the request's Firebase uid). No hard FK
-- to users on purpose — that table is owned by the Python backend's migrations;
-- we keep this schema decoupled and enforce ownership in the API layer.

CREATE TABLE IF NOT EXISTS documents (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL,
    title       text NOT NULL DEFAULT 'Untitled document',
    format_style text NOT NULL DEFAULT 'none',
    word_count  integer NOT NULL DEFAULT 0,
    preview     text NOT NULL DEFAULT '',
    state       jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_documents_user_updated ON documents (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS document_sources (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id uuid NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
    source_ref  text,
    title       text,
    url         text,
    content     text,
    position    integer NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_document_sources_doc ON document_sources (document_id);

CREATE TABLE IF NOT EXISTS document_outlines (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id uuid NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
    outline_ref text,
    type        text,
    title       text,
    position    integer NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_document_outlines_doc ON document_outlines (document_id);

CREATE TABLE IF NOT EXISTS document_outline_bullets (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    outline_id       uuid NOT NULL REFERENCES document_outlines (id) ON DELETE CASCADE,
    parent_bullet_id uuid REFERENCES document_outline_bullets (id) ON DELETE CASCADE,
    text             text NOT NULL DEFAULT '',
    position         integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_outline_bullets_outline ON document_outline_bullets (outline_id);

-- Keep updated_at fresh on every save (overwrite).
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_documents_updated ON documents;
CREATE TRIGGER trg_documents_updated
    BEFORE UPDATE ON documents
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
