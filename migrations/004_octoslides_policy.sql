-- OctoSlides watermark policy (one row), edited from Brokeoctopus.
--   free_watermark: Free (guest) plan decks carry the Octopilot AI badge on every slide
--   exempt_emails:  accounts an admin has released from the free-plan badge
CREATE TABLE IF NOT EXISTS octoslides_policy (
  id             integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  free_watermark boolean NOT NULL DEFAULT true,
  exempt_emails  text[]  NOT NULL DEFAULT '{}',
  updated_by     text,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

INSERT INTO octoslides_policy (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
