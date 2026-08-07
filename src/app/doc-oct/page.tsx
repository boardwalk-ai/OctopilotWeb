import type { Metadata } from "next";
import AuthGate from "@/components/AuthGate";
import StandaloneFormatterGate from "@/components/StandaloneFormatterGate";

export const metadata: Metadata = {
  title: "Doc Oct · Octopilot AI",
  description: "Polish structure without rewriting your voice. Upload or paste a document, fix formatting, and export clean academic papers.",
};

export default function Page() {
  if (process.env.NEXT_PUBLIC_STANDALONE_MODE === "true") return <StandaloneFormatterGate />;
  return <AuthGate initialMode="ghostciter" />;
}
