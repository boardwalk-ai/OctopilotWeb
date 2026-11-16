"use client";

import { useEffect, useState } from "react";

const GLYPHS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/**
 * Shows a certificate ID that "resolves" left to right: each cell cycles through
 * glyphs, then settles on its real character. The server renders the final ID,
 * so it reads correctly without scripts and under reduced motion.
 */
export default function DecodedId({ id, label = "Certificate ID" }: { id: string; label?: string }) {
  const chars = id.split("");
  const [shown, setShown] = useState<string[]>(chars);
  const [settled, setSettled] = useState<boolean[]>(() => chars.map(() => true));

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const target = id.split("");
    const start = performance.now();
    const perChar = 34; // ms between cells settling
    const lead = 180; // ms every cell scrambles before the first settles
    let frame = 0;

    const tick = (now: number) => {
      const elapsed = now - start;
      const nextShown: string[] = [];
      const nextSettled: boolean[] = [];
      target.forEach((ch, i) => {
        const fixed = ch === "-" || i < 5; // the OCTO- prefix never scrambles
        const done = fixed || elapsed > lead + i * perChar;
        nextSettled.push(done);
        nextShown.push(done ? ch : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]);
      });
      setShown(nextShown);
      setSettled(nextSettled);
      if (!nextSettled.every(Boolean)) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [id]);

  return (
    <p className="ov-decoded">
      <span className="visually-hidden">
        {label}: {id}
      </span>
      <span aria-hidden="true" style={{ display: "contents" }}>
        {shown.map((ch, i) => (
          <span
            key={i}
            className={`ov-decoded__ch${chars[i] === "-" ? " ov-decoded__ch--sep" : ""}`}
            data-settled={settled[i] ? "true" : "false"}
          >
            {ch}
          </span>
        ))}
      </span>
    </p>
  );
}
