import type { Metadata } from "next";
import AuthGate from "@/components/AuthGate";
import StandaloneFormatterGate from "@/components/StandaloneFormatterGate";

export const metadata: Metadata = {
  title: "OctopilotSlides · Octopilot AI",
  description: "Your ideas, beautifully presented. Turn research and outlines into polished slide decks with speaker notes and citations.",
};

export default function Page() {
  if (process.env.NEXT_PUBLIC_STANDALONE_MODE === "true") return <StandaloneFormatterGate />;
  return <AuthGate initialMode="octopilotslides" />;
}
