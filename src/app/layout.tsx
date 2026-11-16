import type { Metadata } from "next";
import "./globals.css";
import AnalyticsPixels from "@/components/AnalyticsPixels";

// Google Sans Flex for the whole UI, loaded by the browser from Google Fonts.
// Not via next/font: Google serves this family from /l/font?kit=…&skey=… URLs,
// which next/font's build-time downloader (Turbopack) rejects, failing the build.
// globals.css maps --font-gsf and the older --font-jakarta / --font-sora /
// --font-poppins names onto it.
const GOOGLE_SANS_FLEX_CSS =
  "https://fonts.googleapis.com/css2?family=Google+Sans+Flex:opsz,wght@6..144,1..1000&display=swap";

export const metadata: Metadata = {
  title: "Octopilot AI",
  description: "AI-powered academic writing assistant",
  verification: {
    google: "kFLKADeSqboaC7NTYAa9VIrV-kUP1Nff8dggD-I5Ap4",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={GOOGLE_SANS_FLEX_CSS} />
      </head>
      <body className="antialiased">
        <AnalyticsPixels />
        {children}
      </body>
    </html>
  );
}
