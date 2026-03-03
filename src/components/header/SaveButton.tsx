"use client";

interface SaveButtonProps {
  onClick?: () => void;
  disabled?: boolean;
}

export default function SaveButton({ onClick, disabled }: SaveButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-2 rounded-xl border border-emerald-500/30 px-4 py-2 text-sm font-medium text-emerald-400 transition hover:border-emerald-500/50 hover:bg-emerald-500/10 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
        <path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7" />
        <path d="M7 3v4a1 1 0 0 0 1 1h7" />
      </svg>
      Save
    </button>
  );
}
