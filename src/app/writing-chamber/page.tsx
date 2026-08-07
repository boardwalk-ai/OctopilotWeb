import type { Metadata } from "next";
import AuthGate from "@/components/AuthGate";
import StandaloneFormatterGate from "@/components/StandaloneFormatterGate";

export const metadata: Metadata = {
  title: "Writing Chamber · Octopilot AI",
  description: "Write section by section with AI assistance — we give you the recipe, you do the cooking. Great for learning.",
};

export default function Page() {
  if (process.env.NEXT_PUBLIC_STANDALONE_MODE === "true") return <StandaloneFormatterGate />;
  return <AuthGate initialMode="manual" />;
}
