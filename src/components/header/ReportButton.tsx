"use client";

export default function ReportButton() {
  return (
    <button className="flex flex-col items-center gap-0.5 rounded-lg px-2 py-1 text-white/30 transition hover:text-white/60">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4" />
        <path d="M12 16h.01" />
      </svg>
      <span className="text-[10px] leading-tight">Report a problem</span>
    </button>
  );
}
