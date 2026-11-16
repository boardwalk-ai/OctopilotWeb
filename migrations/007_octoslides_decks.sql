-- OctoSlides decks outlive the process: a run's state (conversation, events, versions) is
-- saved here whenever a turn ends; its files stay in /var/lib/octoslides/<run_id>.
-- Decks are kept 30 days after their last change, then removed with their folder.
CREATE TABLE IF NOT EXISTS octoslides_decks (
  run_id            uuid PRIMARY KEY,
  owner_id          text NOT NULL,
  data_user_id      uuid,
  email             text NOT NULL,
  is_pro            boolean NOT NULL DEFAULT false,
  prompt            text NOT NULL,
  status            text NOT NULL,
  deck_version      integer NOT NULL DEFAULT 0,
  rendered_version  integer NOT NULL DEFAULT -1,
  validated_version integer NOT NULL DEFAULT -1,
  cost_usd          numeric(10, 4) NOT NULL DEFAULT 0,
  steps             integer NOT NULL DEFAULT 0,
  watermark_opt_out boolean NOT NULL DEFAULT false,
  generated_images  integer NOT NULL DEFAULT 0,
  credits           jsonb NOT NULL DEFAULT '[]',
  messages          jsonb NOT NULL DEFAULT '[]',
  events            jsonb NOT NULL DEFAULT '[]',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS octoslides_decks_owner ON octoslides_decks (owner_id, updated_at DESC);
