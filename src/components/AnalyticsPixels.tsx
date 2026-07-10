"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { initPixels, trackPageView, trackSignUp } from "@/lib/analytics";
import { AuthService } from "@/services/AuthService";

/**
 * Boots the marketing pixels once, fires a PageView on every route change, and
 * fires the sign-up conversion the first time a user is authenticated in this
 * browser. Renders nothing.
 */
export default function AnalyticsPixels() {
  const pathname = usePathname();

  useEffect(() => {
    initPixels();
  }, []);

  useEffect(() => {
    trackPageView();
  }, [pathname]);

  useEffect(() => {
    return AuthService.subscribe((user) => {
      if (user) trackSignUp();
    });
  }, []);

  return null;
}
