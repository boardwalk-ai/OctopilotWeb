import type { Metadata } from "next";
import { cache } from "react";
import Bands from "@/components/verify/Bands";
import { VerifyFooter, VerifyNav } from "@/components/verify/Chrome";
import CopyLinkButton from "@/components/verify/CopyLinkButton";
import DecodedId from "@/components/verify/DecodedId";
import IdField from "@/components/verify/IdField";
import {
  certificateUrl,
  getCertificate,
  isCertificateIdFormat,
  linkedInAddToProfileUrl,
  normalizeCertificateId,
  toPublicCertificate,
  type PublicCertificate,
} from "@/server/certificates";

export const dynamic = "force-dynamic";

type LookupResult =
  | { kind: "found"; certificate: PublicCertificate }
  | { kind: "missing"; id: string; malformed: boolean }
  | { kind: "error"; id: string };

const lookup = cache(async (rawId: string): Promise<LookupResult> => {
  const id = normalizeCertificateId(decodeURIComponent(rawId));
  if (!isCertificateIdFormat(id)) return { kind: "missing", id, malformed: true };
  try {
    const record = await getCertificate(id);
    return record ? { kind: "found", certificate: toPublicCertificate(record) } : { kind: "missing", id, malformed: false };
  } catch (error) {
    console.error("[Verify] lookup failed:", error);
    return { kind: "error", id };
  }
});

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : dateFormat.format(date);
}

function formatPeriod(start: string | null, end: string | null): string | null {
  const from = formatDate(start);
  const to = formatDate(end);
  if (from && to) return `${from} to ${to}`;
  return from ? `From ${from}` : to ? `Until ${to}` : null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const result = await lookup(id);
  const base: Metadata = { robots: { index: false, follow: false } };

  if (result.kind !== "found") {
    return { ...base, title: "Certificate not found | OctoPilot AI" };
  }
  const cert = result.certificate;
  const title = `${cert.recipientName}, ${cert.title}`;
  const description =
    cert.status === "valid"
      ? `Verified certificate issued by OctoPilot AI on ${formatDate(cert.issuedOn)}. ${cert.program}.`
      : `This OctoPilot AI certificate was revoked.`;
  return {
    ...base,
    title: `${title} | OctoPilot AI`,
    description,
    alternates: { canonical: certificateUrl(cert.id) },
    openGraph: {
      type: "website",
      siteName: "OctoPilot AI",
      title,
      description,
      url: certificateUrl(cert.id),
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.5 2.8 2.8L16.5 9.5" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5M12 16.4v.1" />
    </svg>
  );
}

function LinkedInIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9.75h4v11H3v-11Zm7 0h3.8v1.5h.06c.53-1 1.83-2.06 3.77-2.06 4.03 0 4.77 2.65 4.77 6.1v5.46h-4v-4.84c0-1.16-.02-2.64-1.61-2.64-1.61 0-1.86 1.26-1.86 2.56v4.92h-4v-11Z" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19.5h14" />
    </svg>
  );
}

function Record({ cert }: { cert: PublicCertificate }) {
  const valid = cert.status === "valid";
  const period = formatPeriod(cert.periodStart, cert.periodEnd);
  const url = certificateUrl(cert.id);

  return (
    <article className={`ov-record${cert.imageUrl ? "" : " ov-record--wide"}`} aria-labelledby="record-name">
      <div className="ov-record__main">
        <div className="ov-headgroup">
          <DecodedId id={cert.id} />
          {valid ? (
            <p className="ov-status ov-status--valid ov-reveal" style={{ ["--i" as string]: 0 }}>
              <CheckIcon />
              Valid certificate, issued by OctoPilot AI
            </p>
          ) : (
            <p className="ov-status ov-status--revoked ov-reveal" style={{ ["--i" as string]: 0 }}>
              <AlertIcon />
              Revoked{cert.revokedAt ? ` on ${formatDate(cert.revokedAt)}` : ""}. This certificate is no longer valid.
            </p>
          )}
          <h1 id="record-name" className={`ov-name ov-reveal${valid ? "" : " ov-name--muted"}`} style={{ ["--i" as string]: 1 }}>
            {cert.recipientName}
          </h1>
          <p className="ov-role ov-reveal" style={{ ["--i" as string]: 2 }}>
            {cert.title}
          </p>
          {cert.description ? (
            <p className="ov-desc ov-reveal" style={{ ["--i" as string]: 3 }}>
              {cert.description}
            </p>
          ) : null}
        </div>

        {!valid && cert.revokedReason ? (
          <p className="ov-notice ov-reveal" style={{ ["--i" as string]: 4 }}>
            <strong>Reason given: </strong>
            {cert.revokedReason}
          </p>
        ) : null}

        <dl className="ov-facts ov-reveal" style={{ ["--i" as string]: 4 }}>
          <div className="ov-facts__full">
            <dt>Program</dt>
            <dd>{cert.program}</dd>
          </div>
          {period ? (
            <div>
              <dt>Participation period</dt>
              <dd>{period}</dd>
            </div>
          ) : null}
          <div>
            <dt>Issued</dt>
            <dd>{formatDate(cert.issuedOn)}</dd>
          </div>
          <div className={period ? "ov-facts__full" : undefined}>
            <dt>Signed by</dt>
            <dd>
              {cert.signerName}, {cert.signerTitle}
            </dd>
          </div>
        </dl>

        <div className="ov-actions ov-reveal" style={{ ["--i" as string]: 5 }}>
          {valid ? (
            <a className="ov-btn" href={linkedInAddToProfileUrl(cert)} target="_blank" rel="noopener noreferrer">
              <LinkedInIcon />
              Add to LinkedIn
            </a>
          ) : null}
          {valid && cert.imageUrl ? (
            <a
              className="ov-btn ov-btn--quiet"
              // ?v= changes whenever the image is replaced, so no cached PDF of an old image is served
              href={`/verify/${cert.id}/pdf?v=${encodeURIComponent(cert.imageUrl.split("/").pop() ?? "")}`}
              download
            >
              <DownloadIcon />
              Download PDF
            </a>
          ) : null}
          <CopyLinkButton url={url} />
        </div>
        {valid ? (
          <p className="ov-note">
            Add to LinkedIn fills in the certificate name, issuer, date, ID and this page&rsquo;s link on your profile.
          </p>
        ) : null}
      </div>

      {cert.imageUrl ? (
        <aside className="ov-record__side ov-reveal" style={{ ["--i" as string]: 3 }}>
          <figure className="ov-certimage">
            <a href={cert.imageUrl} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cert.imageUrl} alt={`Certificate issued to ${cert.recipientName}`} width={2000} height={1414} />
            </a>
            <figcaption>The certificate as issued. Opens full size.</figcaption>
          </figure>
        </aside>
      ) : null}
    </article>
  );
}

function Missing({ id, malformed }: { id: string; malformed: boolean }) {
  return (
    <section className="ov-record ov-record--wide" aria-labelledby="missing-title">
      <div className="ov-record__main">
        <div className="ov-headgroup">
          <p className="ov-status ov-status--missing">
            <AlertIcon />
            {malformed ? "Not a certificate ID" : "No record found"}
          </p>
          <h1 id="missing-title" className="ov-name">
            {malformed ? "That ID is not in our format" : "No certificate has this ID"}
          </h1>
          <p className="ov-desc">
            {malformed
              ? "IDs read OCTO, then 8 letters or numbers, then 6 digits. Check the certificate and try again."
              : "Check each character against the certificate; 8 and B, or 5 and S, are easy to mix up. If it still fails, the certificate was not issued by OctoPilot AI."}
          </p>
        </div>
        <IdField defaultId={malformed ? undefined : id} buttonLabel="Try again" />
      </div>
    </section>
  );
}

export default async function VerifyRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await lookup(id);

  return (
    <>
      <Bands />
      <VerifyNav />
      <main className="ov-container">
        {result.kind === "found" ? (
          <>
            <Record cert={result.certificate} />
            <section className="ov-again" aria-labelledby="again-title">
              <h2 id="again-title">Check another ID</h2>
              <IdField compact />
            </section>
          </>
        ) : result.kind === "missing" ? (
          <Missing id={result.id} malformed={result.malformed} />
        ) : (
          <section className="ov-record ov-record--wide" aria-labelledby="error-title">
            <div className="ov-record__main">
              <div className="ov-headgroup">
                <h1 id="error-title" className="ov-name">
                  Lookups are down for a moment
                </h1>
                <p className="ov-desc">We could not reach the certificate records. Reload this page in a minute; the ID is kept in the address.</p>
              </div>
            </div>
          </section>
        )}
      </main>
      <VerifyFooter />
    </>
  );
}
