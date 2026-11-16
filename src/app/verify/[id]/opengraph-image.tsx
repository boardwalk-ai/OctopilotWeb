import { ImageResponse } from "next/og";
import { getCertificate, toPublicCertificate } from "@/server/certificates";

// Share preview for LinkedIn and chat apps when someone posts a /verify/<id> link.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "OctoPilot AI certificate";

const PAPER = "#110d0d";
const INK = "#f6f0ef";
const MUTED = "#a99f9d";
const RED = "#d61f26";
const DARK = "#2a2525";
const DEEP = "#8c2226";
const GREEN = "#7fd6a0";

// Google Sans Flex 600 for the card, fetched once per server process; the card falls back
// to the built-in face if Google Fonts is unreachable.
let fontPromise: Promise<ArrayBuffer | null> | null = null;
function loadFont(): Promise<ArrayBuffer | null> {
  if (!fontPromise) {
    fontPromise = (async () => {
      try {
        const css = await fetch("https://fonts.googleapis.com/css2?family=Google+Sans+Flex:wght@600&display=swap", {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 6.1) AppleWebKit/534.30 (KHTML, like Gecko) Safari/534.30" },
        }).then((r) => r.text());
        const url = css.match(/src: url\((.+?)\) format\('(?:truetype|opentype|woff)'\)/)?.[1];
        if (!url) return null;
        return await fetch(url).then((r) => r.arrayBuffer());
      } catch {
        return null;
      }
    })();
  }
  return fontPromise;
}

export default async function OpenGraphImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let name = "Certificate lookup";
  let title = "Check an OctoPilot AI certificate";
  let status: string | null = null;
  let certId = "";

  try {
    const record = await getCertificate(decodeURIComponent(id));
    if (record) {
      const cert = toPublicCertificate(record);
      name = cert.recipientName;
      title = cert.title;
      status = cert.status === "valid" ? "Verified certificate" : "Revoked certificate";
      certId = cert.id;
    }
  } catch {
    // Fall back to the generic card.
  }

  const fontData = await loadFont();

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: PAPER, position: "relative", overflow: "hidden", fontFamily: fontData ? "Google Sans Flex" : undefined }}>
        <div style={{ position: "absolute", right: -300, top: -120, width: 900, height: 130, background: DARK, transform: "rotate(45deg)" }} />
        <div style={{ position: "absolute", right: -380, top: 40, width: 900, height: 150, background: RED, transform: "rotate(45deg)" }} />
        <div style={{ position: "absolute", right: -450, top: 210, width: 900, height: 52, background: DEEP, transform: "rotate(45deg)" }} />
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "72px 80px", width: "100%" }}>
          <div style={{ display: "flex", fontSize: 34, fontWeight: 800, letterSpacing: -1 }}>
            <span style={{ color: RED }}>Octo</span>
            <span style={{ color: INK }}>Pilot AI</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", maxWidth: 860 }}>
            {status ? (
              <div style={{ display: "flex", fontSize: 28, fontWeight: 600, color: status.startsWith("Verified") ? GREEN : MUTED, marginBottom: 18 }}>
                {status}
              </div>
            ) : null}
            <div style={{ display: "flex", fontSize: name.length > 22 ? 70 : 86, fontWeight: 700, color: INK, lineHeight: 1.02, letterSpacing: -2 }}>
              {name}
            </div>
            <div style={{ display: "flex", fontSize: 34, color: INK, opacity: 0.86, marginTop: 22, lineHeight: 1.25 }}>{title}</div>
          </div>
          <div style={{ display: "flex", fontSize: 26, color: MUTED }}>{certId ? `${certId}  on octopilotai.app/verify` : "octopilotai.app/verify"}</div>
        </div>
      </div>
    ),
    {
      ...size,
      ...(fontData ? { fonts: [{ name: "Google Sans Flex", data: fontData, weight: 600 as const, style: "normal" as const }] } : {}),
    },
  );
}
