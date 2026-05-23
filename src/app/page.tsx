import AuthGate from "@/components/AuthGate";
import StandaloneFormatterGate from "@/components/StandaloneFormatterGate";

export default function Home() {
  if (process.env.NEXT_PUBLIC_STANDALONE_MODE === "true") {
    return <StandaloneFormatterGate />;
  }
  return <AuthGate />;
}
