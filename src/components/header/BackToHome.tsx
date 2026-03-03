"use client";

interface BackToHomeProps {
  onClick?: () => void;
}

export default function BackToHome({ onClick }: BackToHomeProps) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-full border border-white/[0.1] bg-white/[0.04] px-4 py-2 text-sm text-white/60 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.08] hover:text-white/90 hover:shadow-[0_0_12px_rgba(255,255,255,0.04)]"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="m15 18-6-6 6-6" />
      </svg>
      <span className="font-semibold">Home</span>
    </button>
  );
}
