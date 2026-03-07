"use client";

import { useEffect, useState } from "react";
import { AuthService } from "@/services/AuthService";
import { StreamService } from "@/services/StreamService";

type NotificationItem = {
  id: string;
  title: string;
  resolution_message: string;
  resolution_method: string;
  read_count: number;
  created_at: string;
};

type NotificationsResponse = {
  notifications: NotificationItem[];
  count: number;
};

export default function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const unreadCount = notifications.length;

  const loadNotifications = async () => {
    const email = AuthService.getCurrentUser()?.email?.trim().toLowerCase();
    if (!email) {
      setNotifications([]);
      return;
    }

    setIsLoading(true);
    try {
      const authorization = await AuthService.getAuthorizationHeader();
      const response = await fetch(`/backend/api/v1/notifications/${encodeURIComponent(email)}`, {
        headers: authorization ? { Authorization: authorization } : undefined,
      });
      const payload: NotificationsResponse = await response.json();
      if (!response.ok) {
        throw new Error("Failed to load notifications.");
      }
      setNotifications(payload.notifications || []);
    } catch {
      setNotifications([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadNotifications();
  }, []);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let mounted = true;

    const connect = async () => {
      try {
        cleanup = await StreamService.connect({
          onEvent: (event) => {
            if (!mounted) {
              return;
            }

            if (event.type === "system_notification" || event.type === "sync_reports") {
              void loadNotifications();
            }
          },
        });
      } catch {
        // Best effort only.
      }
    };

    void connect();
    return () => {
      mounted = false;
      cleanup?.();
    };
  }, []);

  const handleMarkAllRead = async () => {
    const email = AuthService.getCurrentUser()?.email?.trim().toLowerCase();
    if (!email || notifications.length === 0) {
      setNotifications([]);
      return;
    }

    try {
      const authorization = await AuthService.getAuthorizationHeader();
      await fetch(`/backend/api/v1/notifications/${encodeURIComponent(email)}/read-all`, {
        method: "PATCH",
        headers: authorization ? { Authorization: authorization } : undefined,
      });
    } finally {
      setNotifications([]);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => {
          const next = !isOpen;
          setIsOpen(next);
          if (next) {
            void loadNotifications();
          }
        }}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-white/60 transition hover:text-white"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-black">
            {unreadCount}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div className="absolute right-0 top-12 z-[90] w-[380px] rounded-[24px] border border-white/10 bg-[#0b0b0b] p-4 shadow-[0_24px_60px_rgba(0,0,0,0.55)]">
          <div className="flex items-center justify-between gap-3 border-b border-white/8 pb-3">
            <div>
              <div className="text-sm font-semibold text-white">Notifications</div>
              <div className="mt-1 text-xs text-white/42">{unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}</div>
            </div>
            <button
              onClick={handleMarkAllRead}
              className="text-xs font-semibold text-white/68 underline underline-offset-4 transition hover:text-red-300"
            >
              Mark all as read
            </button>
          </div>

          <div className="mt-3 max-h-[360px] overflow-y-auto pr-1">
            {isLoading ? (
              <div className="flex min-h-[180px] items-center justify-center text-sm text-white/46">Loading notifications...</div>
            ) : notifications.length > 0 ? (
              <div className="space-y-3">
                {notifications.map((item) => (
                  <article key={item.id} className="rounded-[18px] border border-white/8 bg-[#121212] px-4 py-3">
                    <div className="text-sm font-semibold text-white">{item.title}</div>
                    <div className="mt-2 text-sm leading-6 text-white/58">{item.resolution_message}</div>
                    <div className="mt-2 text-[11px] uppercase tracking-[0.22em] text-white/28">
                      {new Date(item.created_at).toLocaleString()}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="flex min-h-[180px] items-center justify-center text-sm text-white/42">No notifications yet.</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
