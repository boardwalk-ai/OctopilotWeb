-- OctoSlides decks are shared by the web app (Next.js) and the Octopilot app's
-- backend (octoslides-api, Rust): same table, same folders. Only one of them may
-- run a deck at a time. The one running it holds a lease, renewed while it works
-- and released when the turn ends; a lease that runs out (a crash) frees the deck.
--   runner       'web' or 'app': who holds (or last held) the lease
--   lease_until  the lease is valid until then; NULL = free
ALTER TABLE octoslides_decks ADD COLUMN IF NOT EXISTS runner text;
ALTER TABLE octoslides_decks ADD COLUMN IF NOT EXISTS lease_until timestamptz;
