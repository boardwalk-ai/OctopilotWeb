"use client";

import { useState } from "react";

export default function CopyLinkButton({ url }: { url: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setState("copied");
    } catch {
      setState("failed");
    }
    window.setTimeout(() => setState("idle"), 2400);
  };

  return (
    <>
      <button type="button" className="ov-btn ov-btn--quiet" onClick={() => void copy()}>
        {state === "copied" ? "Link copied" : state === "failed" ? "Copy failed, select the address bar" : "Copy link"}
      </button>
      <span className="visually-hidden" role="status">
        {state === "copied" ? "Verification link copied to the clipboard." : ""}
      </span>
    </>
  );
}
