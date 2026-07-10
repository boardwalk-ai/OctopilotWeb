import type { Metadata } from "next";
import { Poppins, Sora } from "next/font/google";
import "./globals.css";
import AnalyticsPixels from "@/components/AnalyticsPixels";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

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
      <body className={`${poppins.variable} ${sora.variable} ${poppins.className} antialiased`}>
        <AnalyticsPixels />
        {children}
      </body>
    </html>
  );
}
