import type { Metadata } from "next";
import AuthGate from "@/components/AuthGate";
import StandaloneFormatterGate from "@/components/StandaloneFormatterGate";

export const metadata: Metadata = {
  title: "Guided Generation · Octopilot AI",
  description: "AI writes a complete, human-sounding essay from your outline and sources — perfect for quick, well-researched drafts.",
};

export default function Page() {
  if (process.env.NEXT_PUBLIC_STANDALONE_MODE === "true") return <StandaloneFormatterGate />;
  return <AuthGate initialMode="automation" />;
}
