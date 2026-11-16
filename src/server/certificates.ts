import { randomInt } from "node:crypto";
import { query, withTransaction } from "@/server/db";

/**
 * Certificates issued by OctoPilot AI, verified publicly at /verify/<id>.
 * Schema: migrations/002_certificates.sql.
 *
 * ID format: OCTO-<8 random chars>-<6 digit serial>. The random part uses an
 * alphabet without look-alike characters (0/O, 1/I/L) so IDs survive being
 * read off a printed certificate and typed back in.
 */

const RANDOM_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const ID_PATTERN = /^OCTO-[A-Z0-9]{8}-[0-9]{6}$/;

export const CERTIFICATE_SITE_URL = (process.env.NEXT_PUBLIC_CERTIFICATE_SITE_URL || "https://octopilotai.app").replace(/\/+$/, "");
export const CERTIFICATE_ISSUER = "OctoPilot AI";

export type CertificateStatus = "valid" | "revoked";

export type CertificateRecord = {
  id: string;
  serial: number;
  recipientName: string;
  title: string;
  description: string;
  program: string;
  periodStart: string | null;
  periodEnd: string | null;
  issuedOn: string;
  signerName: string;
  signerTitle: string;
  imageUrl: string | null;
  status: CertificateStatus;
  revokedReason: string | null;
  revokedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

/** What anyone with the ID may see. No admin metadata. */
export type PublicCertificate = Omit<CertificateRecord, "createdBy" | "createdAt" | "updatedAt" | "serial">;

export type CertificateInput = {
  recipientName: string;
  title: string;
  description?: string;
  program?: string;
  periodStart?: string | null;
  periodEnd?: string | null;
  issuedOn?: string | null;
  signerName?: string;
  signerTitle?: string;
};

type CertificateRow = {
  id: string;
  serial: number;
  recipient_name: string;
  title: string;
  description: string;
  program: string;
  period_start: string | null;
  period_end: string | null;
  issued_on: string;
  signer_name: string;
  signer_title: string;
  image_url: string | null;
  status: CertificateStatus;
  revoked_reason: string | null;
  revoked_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

// Dates come back as plain YYYY-MM-DD strings (to_char) so no timezone shifts.
const SELECT_COLUMNS = `
  id, serial, recipient_name, title, description, program,
  to_char(period_start, 'YYYY-MM-DD') AS period_start,
  to_char(period_end, 'YYYY-MM-DD') AS period_end,
  to_char(issued_on, 'YYYY-MM-DD') AS issued_on,
  signer_name, signer_title, image_url, status, revoked_reason,
  revoked_at::text AS revoked_at, created_by,
  created_at::text AS created_at, updated_at::text AS updated_at`;

function mapRow(row: CertificateRow): CertificateRecord {
  return {
    id: row.id,
    serial: Number(row.serial),
    recipientName: row.recipient_name,
    title: row.title,
    description: row.description,
    program: row.program,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    issuedOn: row.issued_on,
    signerName: row.signer_name,
    signerTitle: row.signer_title,
    imageUrl: row.image_url,
    status: row.status,
    revokedReason: row.revoked_reason,
    revokedAt: row.revoked_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toPublicCertificate(record: CertificateRecord): PublicCertificate {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { createdBy, createdAt, updatedAt, serial, ...rest } = record;
  return rest;
}

/** Uppercases, trims and turns look-alike separators into the canonical form. */
export function normalizeCertificateId(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[‐-―−\s_]+/g, "-")
    .replace(/-+/g, "-");
}

export function isCertificateIdFormat(value: string): boolean {
  return ID_PATTERN.test(value);
}

function randomKey(length = 8): string {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += RANDOM_ALPHABET[randomInt(RANDOM_ALPHABET.length)];
  }
  return out;
}

export function formatCertificateId(key: string, serial: number): string {
  return `OCTO-${key}-${String(serial).padStart(6, "0")}`;
}

export function certificateUrl(id: string): string {
  return `${CERTIFICATE_SITE_URL}/verify/${encodeURIComponent(id)}`;
}

/**
 * LinkedIn's "Add license or certification" deep link, prefilled.
 * Set LINKEDIN_ORGANIZATION_ID to the company page's numeric id so the logo shows;
 * otherwise LinkedIn falls back to the organization name.
 */
export function linkedInAddToProfileUrl(cert: Pick<PublicCertificate, "id" | "title" | "issuedOn">): string {
  const params = new URLSearchParams({ startTask: "CERTIFICATION_NAME", name: cert.title });
  const orgId = process.env.LINKEDIN_ORGANIZATION_ID?.trim();
  if (orgId) {
    params.set("organizationId", orgId);
  } else {
    params.set("organizationName", CERTIFICATE_ISSUER);
  }
  const [year, month] = cert.issuedOn.split("-");
  if (year) params.set("issueYear", year);
  if (month) params.set("issueMonth", String(Number(month)));
  params.set("certUrl", certificateUrl(cert.id));
  params.set("certId", cert.id);
  return `https://www.linkedin.com/profile/add?${params.toString()}`;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function cleanText(value: unknown, field: string, { required = false, max = 500 } = {}): string {
  if (value === undefined || value === null) {
    if (required) throw new CertificateInputError(`${field} is required.`);
    return "";
  }
  if (typeof value !== "string") throw new CertificateInputError(`${field} must be text.`);
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (required && !trimmed) throw new CertificateInputError(`${field} is required.`);
  if (trimmed.length > max) throw new CertificateInputError(`${field} is longer than ${max} characters.`);
  return trimmed;
}

function cleanDate(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !DATE_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
    throw new CertificateInputError(`${field} must be a date (YYYY-MM-DD).`);
  }
  return value;
}

export class CertificateInputError extends Error {}

export function validateCertificateInput(body: Record<string, unknown>): Required<CertificateInput> {
  const periodStart = cleanDate(body.periodStart, "Period start");
  const periodEnd = cleanDate(body.periodEnd, "Period end");
  if (periodStart && periodEnd && periodStart > periodEnd) {
    throw new CertificateInputError("Period end must be on or after period start.");
  }
  return {
    recipientName: cleanText(body.recipientName, "Recipient name", { required: true, max: 120 }),
    title: cleanText(body.title, "Contribution title", { required: true, max: 160 }),
    description: cleanText(body.description, "Description", { max: 1200 }),
    program: cleanText(body.program, "Program", { max: 160 }) || "OctoPilot AI Student Ambassador Program",
    periodStart,
    periodEnd,
    issuedOn: cleanDate(body.issuedOn, "Issue date"),
    signerName: cleanText(body.signerName, "Signer name", { max: 120 }) || "Hein Htet",
    signerTitle: cleanText(body.signerTitle, "Signer title", { max: 120 }) || "Founder and Project Manager",
  };
}

export async function getCertificate(id: string): Promise<CertificateRecord | null> {
  const normalized = normalizeCertificateId(id);
  if (!isCertificateIdFormat(normalized)) return null;
  const rows = await query<CertificateRow>(`SELECT ${SELECT_COLUMNS} FROM certificates WHERE id = $1`, [normalized]);
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function listCertificates(): Promise<CertificateRecord[]> {
  const rows = await query<CertificateRow>(`SELECT ${SELECT_COLUMNS} FROM certificates ORDER BY serial DESC LIMIT 1000`);
  return rows.map(mapRow);
}

export async function createCertificate(input: Required<CertificateInput>, createdBy: string | null): Promise<CertificateRecord> {
  return withTransaction(async (client) => {
    const seq = await client.query<{ serial: string }>("SELECT nextval('certificate_serial_seq') AS serial");
    const serial = Number(seq.rows[0].serial);
    if (serial > 999_999) throw new Error("Certificate serial numbers are exhausted.");

    // The serial alone makes the id unique; the loop only guards the
    // astronomically unlikely case of an id already inserted by hand.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const id = formatCertificateId(randomKey(), serial);
      const result = await client.query<CertificateRow>(
        `INSERT INTO certificates (
            id, serial, recipient_name, title, description, program,
            period_start, period_end, issued_on, signer_name, signer_title, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::date, current_date), $10, $11, $12)
          ON CONFLICT (id) DO NOTHING
          RETURNING ${SELECT_COLUMNS}`,
        [
          id,
          serial,
          input.recipientName,
          input.title,
          input.description,
          input.program,
          input.periodStart,
          input.periodEnd,
          input.issuedOn,
          input.signerName,
          input.signerTitle,
          createdBy,
        ],
      );
      if (result.rows[0]) return mapRow(result.rows[0]);
    }
    throw new Error("Could not allocate a unique certificate id.");
  });
}

/** Edits the printed fields. The image is managed only by the image upload route. */
export async function updateCertificate(id: string, input: Required<CertificateInput>): Promise<CertificateRecord | null> {
  const rows = await query<CertificateRow>(
    `UPDATE certificates SET
        recipient_name = $2, title = $3, description = $4, program = $5,
        period_start = $6, period_end = $7, issued_on = COALESCE($8::date, issued_on),
        signer_name = $9, signer_title = $10, updated_at = now()
      WHERE id = $1
      RETURNING ${SELECT_COLUMNS}`,
    [
      normalizeCertificateId(id),
      input.recipientName,
      input.title,
      input.description,
      input.program,
      input.periodStart,
      input.periodEnd,
      input.issuedOn,
      input.signerName,
      input.signerTitle,
    ],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

/**
 * Points a certificate at a new image (or none) and returns the URL it had
 * before, so the caller can delete that file once the row is committed.
 * The row lock makes two uploads at once resolve cleanly: each sees the
 * other's URL as "previous" and nothing is left orphaned.
 */
export async function swapCertificateImageUrl(
  id: string,
  imageUrl: string | null,
): Promise<{ record: CertificateRecord; previousUrl: string | null } | null> {
  return withTransaction(async (client) => {
    const current = await client.query<{ image_url: string | null }>(
      "SELECT image_url FROM certificates WHERE id = $1 FOR UPDATE",
      [normalizeCertificateId(id)],
    );
    if (!current.rows[0]) return null;
    const result = await client.query<CertificateRow>(
      `UPDATE certificates SET image_url = $2, updated_at = now() WHERE id = $1 RETURNING ${SELECT_COLUMNS}`,
      [normalizeCertificateId(id), imageUrl],
    );
    return { record: mapRow(result.rows[0]), previousUrl: current.rows[0].image_url };
  });
}

export async function setCertificateStatus(
  id: string,
  status: CertificateStatus,
  reason: string | null,
): Promise<CertificateRecord | null> {
  const rows = await query<CertificateRow>(
    `UPDATE certificates SET
        status = $2,
        revoked_reason = CASE WHEN $2 = 'revoked' THEN $3 ELSE NULL END,
        revoked_at = CASE WHEN $2 = 'revoked' THEN now() ELSE NULL END,
        updated_at = now()
      WHERE id = $1
      RETURNING ${SELECT_COLUMNS}`,
    [normalizeCertificateId(id), status, reason],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}
