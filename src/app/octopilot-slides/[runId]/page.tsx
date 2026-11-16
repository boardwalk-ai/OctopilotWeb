import type { Metadata } from "next";
import AuthGate from "@/components/AuthGate";
import StandaloneFormatterGate from "@/components/StandaloneFormatterGate";

export const metadata: Metadata = {
  title: "OctopilotSlides · Octopilot AI",
  robots: { index: false, follow: false },
};

/** A saved deck: /octopilot-slides/<deck id>. Only its owner can open it (checked by the API). */
export default async function Page({ params }: { params: Promise<{ runId: string }> }) {
  if (process.env.NEXT_PUBLIC_STANDALONE_MODE === "true") return <StandaloneFormatterGate />;
  const { runId } = await params;
  return <AuthGate initialMode="octopilotslides" initialDeckId={runId} />;
}
