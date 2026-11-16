-- Certificates issued by OctoPilot AI (Student Ambassador / intern programs),
-- verified publicly at https://octopilotai.app/verify/<id>.
-- Applied to the octopilot Postgres DB. Idempotent.
--
-- id format: OCTO-<8 random chars>-<6 digit serial>, e.g. OCTO-7KQ2MZ4P-000001.
-- The serial comes from certificate_serial_seq so numbers are issued in order
-- and never reused, even if a certificate is later revoked.

CREATE SEQUENCE IF NOT EXISTS certificate_serial_seq START 1;

CREATE TABLE IF NOT EXISTS certificates (
    id              text PRIMARY KEY,
    serial          integer NOT NULL UNIQUE,
    recipient_name  text NOT NULL,
    title           text NOT NULL,
    description     text NOT NULL DEFAULT '',
    program         text NOT NULL DEFAULT 'OctoPilot AI Student Ambassador Program',
    period_start    date,
    period_end      date,
    issued_on       date NOT NULL DEFAULT current_date,
    signer_name     text NOT NULL DEFAULT 'Hein Htet',
    signer_title    text NOT NULL DEFAULT 'Founder and Project Manager',
    image_url       text,
    status          text NOT NULL DEFAULT 'valid' CHECK (status IN ('valid', 'revoked')),
    revoked_reason  text,
    revoked_at      timestamptz,
    created_by      text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT certificates_id_format CHECK (id ~ '^OCTO-[A-Z0-9]{8}-[0-9]{6}$')
);

CREATE INDEX IF NOT EXISTS idx_certificates_serial ON certificates (serial DESC);
