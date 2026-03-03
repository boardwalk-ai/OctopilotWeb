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
    <header className={`fixed top-0 left-0 right-0 z-40 flex h-16 items-center justify-between bg-[#0a0a0a] px-4 ${className}`}>
      <div className="flex items-center gap-3">
        {left}
      </div>
      <div className="flex items-center">
        {center}
      </div>
      <div className="flex items-center gap-3">
        {right}
      </div>
    </header>
  );
}
