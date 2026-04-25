"use client";

import { useEffect } from "react";

const LINK_ID = "octopilot-slides-google-fonts";

export default function GoogleFontsLink({ href }: { href: string | null }) {
  useEffect(() => {
    if (!href) return;
    let el = document.getElementById(LINK_ID) as HTMLLinkElement | null;
    if (!el) {
      el = document.createElement("link");
      el.id = LINK_ID;
      el.rel = "stylesheet";
      document.head.appendChild(el);
    }
    el.href = href;
  }, [href]);

  return null;
}
