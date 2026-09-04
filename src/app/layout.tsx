import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Sora } from "next/font/google";
import "./globals.css";
import AnalyticsPixels from "@/components/AnalyticsPixels";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
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
      <body className={`${jakarta.variable} ${sora.variable} ${jakarta.className} antialiased`}>
        <AnalyticsPixels />
        {children}
      </body>
    </html>
  );
}
