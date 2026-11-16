import type { Metadata } from "next";
import IdField from "@/components/verify/IdField";
import Bands from "@/components/verify/Bands";
import { VerifyFooter, VerifyNav } from "@/components/verify/Chrome";

export const metadata: Metadata = {
  title: "Check an OctoPilot certificate | OctoPilot AI",
  description: "Enter the ID printed on an OctoPilot AI certificate to see who it was issued to, for what, and whether it is still valid.",
  alternates: { canonical: "https://octopilotai.app/verify" },
};

export default function VerifyLookupPage() {
  return (
    <>
      <Bands />
      <VerifyNav />
      <main className="ov-container">
        <section className="ov-hero" aria-labelledby="verify-title">
          <div>
            <h1 id="verify-title">Check an OctoPilot certificate</h1>
            <p className="ov-lead">Type the ID printed on the certificate to open its record.</p>
          </div>
          <IdField autoFocus />
        </section>

        <section className="ov-section" aria-labelledby="anatomy-title">
          <h2 id="anatomy-title">Every ID has three parts</h2>
          <div className="ov-section__body">
            <p>You will find it at the bottom of the certificate, beside the issue date.</p>
            <ol className="ov-anatomy" aria-label="An example ID, OCTO-7KQ2MZ4P-000014, in its three parts">
              <li className="ov-anatomy__part">
                <code className="ov-anatomy__code">OCTO</code>
                <strong>Issuer</strong>
                <span>Always OCTO, for OctoPilot AI.</span>
              </li>
              <li className="ov-anatomy__part">
                <code className="ov-anatomy__code">7KQ2MZ4P</code>
                <strong>Key</strong>
                <span>Eight random letters and numbers, unique to one person.</span>
              </li>
              <li className="ov-anatomy__part">
                <code className="ov-anatomy__code">000014</code>
                <strong>Serial</strong>
                <span>Counts up as certificates are issued.</span>
              </li>
            </ol>
          </div>
        </section>

        <section className="ov-section" aria-labelledby="record-title">
          <h2 id="record-title">What the record confirms</h2>
          <div className="ov-section__body">
            <p>Each ID opens one page, kept by OctoPilot AI, that matches the printed certificate line for line.</p>
            <dl className="ov-fields">
              <div>
                <dt>Recipient</dt>
                <dd>The full name as printed.</dd>
              </div>
              <div>
                <dt>Contribution</dt>
                <dd>The work the certificate recognises.</dd>
              </div>
              <div>
                <dt>Program and period</dt>
                <dd>Which program, from when to when.</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>Valid, or revoked with the date it changed.</dd>
              </div>
            </dl>
          </div>
        </section>
      </main>
      <VerifyFooter />
    </>
  );
}
