"use client";

import { useState } from "react";
import desktopStyles from "./FormatStyleView.module.css";
import mobileStyles from "./FormatStyleViewMobile.module.css";

/* ── Merge desktop + mobile CSS-module maps ──────────────────────────────── */
function mergeStyles(...mods: Record<string, string>[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const mod of mods) {
    for (const [key, val] of Object.entries(mod)) {
      result[key] = result[key] ? `${result[key]} ${val}` : val;
    }
  }
  return result;
}
const styles = mergeStyles(
  desktopStyles as Record<string, string>,
  mobileStyles as Record<string, string>,
);

/* ── Format style definitions ────────────────────────────────────────────── */
export type FormatStyleId = "mla" | "apa" | "chicago" | "ieee" | "harvard";

const FORMAT_STYLES: {
  id: FormatStyleId;
  label: string;
  abbr: string;
  color: string;
}[] = [
  { id: "mla",     label: "MLA (8th Edition)",      abbr: "M", color: "#7c3aed" },
  { id: "apa",     label: "APA (7th Edition)",       abbr: "A", color: "#2563eb" },
  { id: "chicago", label: "Chicago (17th Edition)",  abbr: "C", color: "#ea580c" },
  { id: "ieee",    label: "IEEE",                    abbr: "I", color: "#16a34a" },
  { id: "harvard", label: "Harvard",                 abbr: "H", color: "#0369a1" },
];

/* ── Props ───────────────────────────────────────────────────────────────── */
type FormatStyleViewProps = {
  onBack: () => void;
  onContinue: (style: FormatStyleId) => void;
  defaultStyle?: FormatStyleId;
};

/* ── Component ───────────────────────────────────────────────────────────── */
export default function FormatStyleView({
  onBack,
  onContinue,
  defaultStyle = "mla",
}: FormatStyleViewProps) {
  const [selected, setSelected] = useState<FormatStyleId>(defaultStyle);

  return (
    <div className={styles.shell}>
      {/* ── Top nav ───────────────────────────────────────────────────── */}
      <div className={styles.topNav}>
        <button type="button" className={styles.backBtn} onClick={onBack}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="m15 18-6-6 6-6" />
          </svg>
          Back
        </button>
        <div className={styles.badge}>
          <span className={styles.badgeDot} />
          Formatter Tool
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────── */}
      <div className={styles.body}>
        <div className={styles.card}>

          {/* Step header */}
          <div className={styles.stepHeader}>
            <div className={styles.stepNum}>3</div>
            <h1 className={styles.stepTitle}>Choose Format Style</h1>
          </div>

          <p className={styles.subtitle}>Select your formatting style</p>

          {/* Format options */}
          <div className={styles.optionList}>
            {FORMAT_STYLES.map((fmt) => {
              const isSelected = selected === fmt.id;
              return (
                <div
                  key={fmt.id}
                  className={isSelected ? styles.optionRowSelected : styles.optionRow}
                  onClick={() => setSelected(fmt.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelected(fmt.id);
                    }
                  }}
                  role="radio"
                  aria-checked={isSelected}
                  tabIndex={0}
                >
                  {/* Letter badge */}
                  <div
                    className={styles.fmtBadge}
                    style={{ background: fmt.color }}
                    aria-hidden
                  >
                    {fmt.abbr}
                  </div>

                  {/* Label */}
                  <span className={styles.fmtLabel}>{fmt.label}</span>

                  {/* Radio indicator */}
                  <div className={isSelected ? styles.radioSelected : styles.radio} aria-hidden>
                    {isSelected ? <div className={styles.radioDot} /> : null}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Info box */}
          <div className={styles.infoBox}>
            <p className={styles.infoTitle}>This will determine:</p>
            <ul className={styles.infoList}>
              <li>In-text citation style</li>
              <li>Bibliography format</li>
              <li>Document formatting rules</li>
              <li>Headers, spacing, and more</li>
            </ul>
          </div>

          {/* Continue */}
          <button
            type="button"
            className={styles.continueBtn}
            onClick={() => onContinue(selected)}
          >
            <span className={styles.continueBtnShine} aria-hidden />
            Continue
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>

        </div>
      </div>
    </div>
  );
}
