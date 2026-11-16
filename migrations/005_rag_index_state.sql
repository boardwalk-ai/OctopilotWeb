-- Which saved documents are in the Gyrfalcon search index, and at what content hash.
CREATE TABLE IF NOT EXISTS rag_index_state (
  document_id  uuid PRIMARY KEY,
  user_id      uuid NOT NULL,
  text_hash    text NOT NULL,
  source_count integer NOT NULL DEFAULT 0,
  indexed_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rag_index_state_user ON rag_index_state (user_id);
