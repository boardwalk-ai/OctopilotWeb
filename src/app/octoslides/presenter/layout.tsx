import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Presenter view · OctoSlides",
  robots: { index: false, follow: false },
};

export default function PresenterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
