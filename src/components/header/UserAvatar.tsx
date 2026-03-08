"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import { AuthService } from "@/services/AuthService";
import ProfileModal from "./ProfileModal";

interface UserAvatarProps {
  src?: string;
  name?: string;
}

export default function UserAvatar({ src, name = "U" }: UserAvatarProps) {
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setUser(AuthService.getCurrentUser());
    return AuthService.subscribe(setUser);
  }, []);

  const displayName = user?.displayName || user?.email || name;
  const avatarSrc = src || user?.photoURL || user?.providerData.find((provider) => provider.photoURL)?.photoURL || undefined;
  const initials = useMemo(() => {
    return (displayName || "U")
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("") || "U";
  }, [displayName]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-white/[0.08] bg-white/[0.04] text-xs font-medium text-white/50 transition hover:border-white/15 hover:bg-white/[0.08]"
      >
        {avatarSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarSrc} alt={displayName} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
        ) : user ? (
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/80">{initials}</span>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-white/50">
            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        )}
      </button>
      <ProfileModal open={open} onClose={() => setOpen(false)} user={user} />
    </>
  );
}
