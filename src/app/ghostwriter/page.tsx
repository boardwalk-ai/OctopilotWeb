import type { Metadata } from "next";
import AuthGate from "@/components/AuthGate";
import StandaloneFormatterGate from "@/components/StandaloneFormatterGate";

export const metadata: Metadata = {
  title: "Ghostwriter · Octopilot AI",
  description: "You steer the idea, AI sharpens the prose. A revision-first writing mode for reshaping drafts and polishing sections.",
};

export default function Page() {
  if (process.env.NEXT_PUBLIC_STANDALONE_MODE === "true") return <StandaloneFormatterGate />;
  return <AuthGate initialMode="ghostwriter" />;
}
