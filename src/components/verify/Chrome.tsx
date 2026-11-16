import Link from "next/link";

export function VerifyNav() {
  return (
    <header className="ov-container">
      <nav className="ov-nav" aria-label="Certificate verification">
        <Link href="/verify" className="ov-wordmark" aria-label="OctoPilot AI certificate lookup">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logoText.png" alt="OctoPilot AI" width={500} height={50} />
        </Link>
        <a className="ov-navlink" href="https://octopilotai.com">
          About OctoPilot
        </a>
      </nav>
    </header>
  );
}

export function VerifyFooter() {
  return (
    <footer className="ov-container">
      <div className="ov-footer">
        <p>Certificates are issued and kept by OctoPilot AI.</p>
        <a href="https://octopilotai.app">octopilotai.app</a>
      </div>
    </footer>
  );
}
