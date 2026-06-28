import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Training Programs · OctoPilot",
  description:
    "Mentor-led developer training tracks. Program 01 — Architectural Foundations, Dart Reading & Git (Week 1).",
};

export default function TrainingProgramsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
