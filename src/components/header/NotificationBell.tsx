"use client";

import { useState } from "react";

export default function NotificationBell() {
  const [hasUnread] = useState(false);

  return (
    <button className="relative flex h-9 w-9 items-center justify-center rounded-lg text-white/60 transition hover:text-white">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {hasUnread && (
        <span className="absolute top-1 right-1 h-2.5 w-2.5 rounded-full border-2 border-[#0a0a0a] bg-red-500" />
      )}
    </button>
  );
}
