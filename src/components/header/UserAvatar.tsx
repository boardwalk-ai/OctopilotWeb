"use client";

interface UserAvatarProps {
  src?: string;
  name?: string;
}

export default function UserAvatar({ src, name = "U" }: UserAvatarProps) {
  return (
    <button className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-white/[0.08] bg-white/[0.04] text-xs font-medium text-white/50 transition hover:border-white/15 hover:bg-white/[0.08]">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} className="h-full w-full object-cover" />
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-white/50">
          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      )}
    </button>
  );
}
