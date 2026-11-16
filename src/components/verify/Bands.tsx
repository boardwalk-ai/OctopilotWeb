/**
 * The diagonal red and charcoal bands from the printed OctoPilot certificate,
 * set in the page's top-right corner. They slide in once (pure CSS); under
 * reduced motion they are simply there.
 */
export default function Bands() {
  return (
    <div className="ov-bands" aria-hidden="true" data-play="true">
      <span className="ov-band ov-band--dark" style={{ ["--i" as string]: 0 }} />
      <span className="ov-band ov-band--red" style={{ ["--i" as string]: 1 }} />
      <span className="ov-band ov-band--deep" style={{ ["--i" as string]: 2 }} />
    </div>
  );
}
