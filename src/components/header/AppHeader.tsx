"use client";

import { ReactNode } from "react";

interface AppHeaderProps {
  left?: ReactNode;
  center?: ReactNode;
  right?: ReactNode;
  className?: string;
}

export default function AppHeader({ left, center, right, className = "" }: AppHeaderProps) {
  return (
    <header className={`fixed top-0 left-0 right-0 z-40 flex min-h-16 flex-wrap items-start justify-between gap-x-4 gap-y-3 bg-[#0a0a0a] px-4 py-3 ${className}`}>
      <div className="flex min-h-10 items-center gap-3">
        {left}
      </div>
      <div className="flex min-h-10 items-center">
        {center}
      </div>
      <div className="flex flex-wrap items-start justify-end gap-3">
        {right}
      </div>
    </header>
  );
}
