"use client";

import { useEffect, useRef, useState } from "react";
import { HumanizerService } from "@/services/HumanizerService";
import styles from "./HumanizerHubView.module.css";

// ── Types ─────────────────────────────────────────────────────────────────────

type Engine = "undetectable" | "stealthgpt";

type UndetectableParams = { readability: string; purpose: string; strength: string };
type StealthParams = { educationLevel: string; strength: string; detector: string; rephrase: boolean };

// ── Utility ───────────────────────────────────────────────────────────────────

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// ── Small select ──────────────────────────────────────────────────────────────

function Param({
  label,
  value,
  options,
  onChange,
  engine,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  engine: Engine;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const accentClass =
    engine === "stealthgpt" ? styles.selectBtnStealth : styles.selectBtnUndetectable;

  return (
    <div>
      <div className={styles.paramLabel}>{label}</div>
      <div className={styles.selectWrap} ref={ref}>
        <button
          type="button"
          className={`${styles.selectBtn} ${accentClass} ${open ? styles.selectOpen : ""}`}
          onClick={() => setOpen((p) => !p)}
        >
          <span>{value}</span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            style={{ opacity: 0.5, transform: open ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.15s" }}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        {open && (
          <div className={styles.selectMenu}>
            {options.map((opt) => (
              <div
                key={opt}
                className={`${styles.selectOption} ${value === opt ? styles.selectOptionActive : ""}`}
                onClick={() => { onChange(opt); setOpen(false); }}
              >
                {value === opt && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
                {value !== opt && <span style={{ width: 12, display: "inline-block" }} />}
                {opt}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function HumanizerHubView({ onBack }: { onBack: () => void }) {
  // ── Page state
  const [page, setPage] = useState<1 | 2>(1);

  // ── Input
  const [content, setContent] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Engine
  const [engine, setEngine] = useState<Engine>("undetectable");

  // ── Params
  const [undetectable, setUndetectable] = useState<UndetectableParams>({
    readability: "University",
    purpose: "Essay",
    strength: "More Human",
  });
  const [stealth, setStealth] = useState<StealthParams>({
    educationLevel: "Standard",
    strength: "Medium",
    detector: "GPTZero",
    rephrase: false,
  });

  // ── Processing
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Result / stream animation
  const [result, setResult] = useState("");
  const [displayed, setDisplayed] = useState("");
  const [streaming, setStreaming] = useState(false);
  const streamRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamIndexRef = useRef(0);

  // ── Copy
  const [copied, setCopied] = useState(false);

  // Word counts
  const inputWords = countWords(content);
  const resultWords = countWords(result);

  // ── Stream animation ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!result) return;
    setDisplayed("");
    setStreaming(true);
    streamIndexRef.current = 0;

    const CHUNK = 4;                  // chars per tick
    const BASE_DELAY = 12;            // ms per tick
    const JITTER = 8;

    const tick = () => {
      const idx = streamIndexRef.current;
      if (idx >= result.length) {
        setStreaming(false);
        return;
      }
      const next = Math.min(idx + CHUNK, result.length);
      setDisplayed(result.slice(0, next));
      streamIndexRef.current = next;
      const delay = BASE_DELAY + Math.random() * JITTER;
      streamRef.current = setTimeout(tick, delay);
    };

    streamRef.current = setTimeout(tick, 60); // small initial pause for drama
    return () => { if (streamRef.current) clearTimeout(streamRef.current); };
  }, [result]);

  // ── Humanize ─────────────────────────────────────────────────────────────

  const handleHumanize = async () => {
    if (!content.trim() || isProcessing) return;
    setIsProcessing(true);
    setError(null);
    setResult("");
    setDisplayed("");

    try {
      let output = "";
      if (engine === "undetectable") {
        output = await HumanizerService.undetectableAI({
          content: content.trim(),
          readability: undetectable.readability,
          purpose: undetectable.purpose,
          strength: undetectable.strength,
        });
      } else {
        output = await HumanizerService.stealthGPT({
          prompt: content.trim(),
          rephrase: stealth.rephrase,
          educationLevel: stealth.educationLevel,
          strength: stealth.strength,
          detector: stealth.detector,
        });
      }
      setResult(output);
      setPage(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Humanization failed. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Copy ─────────────────────────────────────────────────────────────────

  const handleCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = result;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={styles.shell}>
      {/* Loading overlay */}
      {isProcessing && (
        <div className={styles.loadingOverlay}>
          <div className={styles.loadingCard}>
            <div className={styles.loadingCardTopLine} />
            <div className={`${styles.loadingOrb} ${styles.loadingOrbL}`} />
            <div className={`${styles.loadingOrb} ${styles.loadingOrbR}`} />

            <div className={styles.loadingIconWrap}>
              <div className={styles.loadingIconRing}>
                <div className={styles.loadingRingBase} />
                <div className={styles.loadingRingSpin} />
                <div className={styles.loadingRingInner}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m12 3 1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3L12 3Z" />
                  </svg>
                </div>
              </div>
            </div>

            <h2 className={styles.loadingTitle}>
              {engine === "undetectable" ? "Undetectable AI" : "StealthGPT"} at work
            </h2>
            <p className={styles.loadingSub}>
              Rewriting sentence structures, smoothing phrasing, and injecting a natural human voice into your content.
            </p>

            <div className={styles.loadingBar}>
              <div className={styles.loadingBarInner} />
            </div>

            <div className={styles.loadingStatus}>
              <span className={styles.loadingStatusDot} />
              Processing
            </div>
          </div>
        </div>
      )}

      {/* Slide track */}
      <div className={`${styles.pageTrack} ${page === 2 ? styles.onPage2 : ""}`}>

        {/* ── PAGE 1 ── */}
        <div className={styles.page}>
          <div className={styles.p1Inner}>

            {/* Back nav */}
            <button className={styles.backBtn} onClick={onBack} style={{ marginBottom: 32 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="m15 18-6-6 6-6" />
              </svg>
              Back
            </button>

            {/* Badge */}
            <div className={styles.badge}>
              <span className={styles.badgeDot} />
              Humanizer Hub
            </div>

            {/* Hero */}
            <h1 className={styles.heroTitle}>
              Make your content<br />
              <span>undetectable.</span>
            </h1>
            <p className={styles.heroSub}>
              Paste your AI-generated text, choose an engine and parameters, and get a humanized version that bypasses detection tools.
            </p>

            {/* Error */}
            {error && (
              <div className={styles.errorBar}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 8v4M12 16h.01" />
                </svg>
                {error}
              </div>
            )}

            {/* Input card */}
            <div className={styles.inputCard}>
              <div className={styles.inputCardHeader}>
                <span className={styles.inputCardLabel}>Your Content</span>
                <span className={`${styles.wordCount} ${inputWords > 0 ? styles.hasContent : ""}`}>
                  {inputWords > 0 ? `${inputWords} words` : "0 words"}
                </span>
              </div>
              <textarea
                ref={textareaRef}
                className={styles.textarea}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Paste your AI-generated essay, article, or any text here…"
                rows={9}
              />
              <div className={styles.inputCardFooter}>
                <button className={styles.clearBtn} onClick={() => setContent("")} disabled={!content}>
                  Clear
                </button>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.15)", fontWeight: 600 }}>
                  {content.length.toLocaleString()} chars
                </span>
              </div>
            </div>

            {/* Engine selection */}
            <div className={styles.sectionTitle}>Choose Humanizer</div>
            <div className={styles.engineGrid}>

              {/* Undetectable AI */}
              <div
                className={`${styles.engineCard} ${engine === "undetectable" ? styles.activeUndetectable : ""}`}
                onClick={() => setEngine("undetectable")}
              >
                <div className={styles.engineCardGlow} />
                <div className={styles.engineCardTop}>
                  <div className={styles.engineCardName}>
                    <div className={styles.engineDot} style={{ background: "#3b82f6", boxShadow: engine === "undetectable" ? "0 0 8px #3b82f6" : "none" }} />
                    Undetectable AI
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className={`${styles.engineBadge} ${styles.engineBadgeRec}`}>Recommended</span>
                    <div className={`${styles.checkRing} ${engine === "undetectable" ? styles.checkRingActive : ""}`}
                      style={engine === "undetectable" ? { background: "#3b82f6", borderColor: "#3b82f6" } : {}}
                    >
                      {engine === "undetectable" && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      )}
                    </div>
                  </div>
                </div>
                <p className={styles.engineCardDesc}>
                  Best for academic essays. Adjustable readability and purpose targeting.
                </p>
              </div>

              {/* StealthGPT */}
              <div
                className={`${styles.engineCard} ${engine === "stealthgpt" ? styles.activeStealth : ""}`}
                onClick={() => setEngine("stealthgpt")}
              >
                <div className={styles.engineCardGlow} />
                <div className={styles.engineCardTop}>
                  <div className={styles.engineCardName}>
                    <div className={styles.engineDot} style={{ background: "#a855f7", boxShadow: engine === "stealthgpt" ? "0 0 8px #a855f7" : "none" }} />
                    StealthGPT
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className={`${styles.engineBadge} ${styles.engineBadgePower}`}>Powerful</span>
                    <div className={`${styles.checkRing} ${engine === "stealthgpt" ? styles.checkRingActive : ""}`}
                      style={engine === "stealthgpt" ? { background: "#a855f7", borderColor: "#a855f7" } : {}}
                    >
                      {engine === "stealthgpt" && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      )}
                    </div>
                  </div>
                </div>
                <p className={styles.engineCardDesc}>
                  Aggressive rewriting with rephrase mode. Targets specific AI detectors.
                </p>
              </div>
            </div>

            {/* Parameters panel */}
            <div className={styles.paramsPanel}
              style={{ borderColor: engine === "undetectable" ? "rgba(59,130,246,0.15)" : "rgba(168,85,247,0.15)" }}
            >
              <div className={styles.sectionTitle} style={{ marginBottom: 20 }}>
                {engine === "undetectable" ? "Undetectable AI" : "StealthGPT"} Parameters
              </div>

              {engine === "undetectable" ? (
                <div className={styles.paramsGrid}>
                  <Param
                    engine="undetectable"
                    label="Readability"
                    value={undetectable.readability}
                    options={["High School", "University", "Doctorate", "Journalist", "Marketing"]}
                    onChange={(v) => setUndetectable((p) => ({ ...p, readability: v }))}
                  />
                  <Param
                    engine="undetectable"
                    label="Purpose"
                    value={undetectable.purpose}
                    options={["Essay", "Article", "Marketing", "Story", "Cover Letter", "Report"]}
                    onChange={(v) => setUndetectable((p) => ({ ...p, purpose: v }))}
                  />
                  <Param
                    engine="undetectable"
                    label="Strength"
                    value={undetectable.strength}
                    options={["Quality", "Balance", "More Human"]}
                    onChange={(v) => setUndetectable((p) => ({ ...p, strength: v }))}
                  />
                </div>
              ) : (
                <div className={styles.paramsGrid}>
                  <Param
                    engine="stealthgpt"
                    label="Education Level"
                    value={stealth.educationLevel}
                    options={["Middle School", "High School", "Standard", "College"]}
                    onChange={(v) => setStealth((p) => ({ ...p, educationLevel: v }))}
                  />
                  <Param
                    engine="stealthgpt"
                    label="Strength"
                    value={stealth.strength}
                    options={["Low", "Medium", "High"]}
                    onChange={(v) => setStealth((p) => ({ ...p, strength: v }))}
                  />
                  <Param
                    engine="stealthgpt"
                    label="Target Detector"
                    value={stealth.detector}
                    options={["GPTZero", "Originality", "Turnitin"]}
                    onChange={(v) => setStealth((p) => ({ ...p, detector: v }))}
                  />
                  {/* Rephrase toggle as 4th cell */}
                  <div>
                    <div className={styles.paramLabel}>Rephrase Mode</div>
                    <div className={styles.toggleRow}>
                      <span className={styles.toggleLabel}>Enable Rephrase</span>
                      <div
                        className={styles.toggleTrack}
                        style={{ background: stealth.rephrase ? "#a855f7" : "rgba(255,255,255,0.12)" }}
                        onClick={() => setStealth((p) => ({ ...p, rephrase: !p.rephrase }))}
                      >
                        <div
                          className={styles.toggleThumb}
                          style={{ transform: stealth.rephrase ? "translateX(18px)" : "translateX(3px)" }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* CTA */}
            <div className={styles.ctaRow}>
              <button
                className={styles.ctaBtn}
                disabled={!content.trim() || isProcessing}
                onClick={handleHumanize}
              >
                <div className={styles.ctaBtnShimmer} />
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m12 3 1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3L12 3Z" />
                </svg>
                Humanize Content
              </button>
            </div>

          </div>
        </div>

        {/* ── PAGE 2 ── */}
        <div className={styles.page}>
          <div className={styles.p2Inner}>

            {/* Header */}
            <div className={styles.p2Header}>
              <div className={styles.p2HeaderLeft}>
                <h2 className={styles.p2HeaderTitle}>Humanized Result</h2>
                <span className={styles.p2HeaderSub}>
                  via {engine === "undetectable" ? "Undetectable AI" : "StealthGPT"} · ready to use
                </span>
              </div>
              <div className={styles.p2HeaderActions}>
                <button
                  className={styles.backBtn}
                  onClick={() => { setPage(1); setResult(""); setDisplayed(""); setStreaming(false); if (streamRef.current) clearTimeout(streamRef.current); }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="m15 18-6-6 6-6" />
                  </svg>
                  Redo
                </button>
              </div>
            </div>

            {/* Stats */}
            {result && (
              <div className={styles.statsRow}>
                <div className={styles.statPill}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M4 6h16M4 12h16M4 18h7" /></svg>
                  Before: {inputWords} words
                </div>
                <div className={styles.statDivider} />
                <div className={styles.statPill} style={{ color: "rgba(52,211,153,0.8)" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M4 6h16M4 12h16M4 18h7" /></svg>
                  After: {resultWords} words
                </div>
                {inputWords > 0 && resultWords > 0 && (
                  <>
                    <div className={styles.statDivider} />
                    <div className={styles.statChange}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        {resultWords >= inputWords
                          ? <path d="m18 15-6-6-6 6" />
                          : <path d="m6 9 6 6 6-6" />
                        }
                      </svg>
                      {Math.abs(resultWords - inputWords)} words {resultWords >= inputWords ? "added" : "removed"}
                    </div>
                  </>
                )}
                <div style={{ marginLeft: "auto" }}>
                  <div className={styles.statPill}
                    style={{ background: engine === "undetectable" ? "rgba(59,130,246,0.08)" : "rgba(168,85,247,0.08)", color: engine === "undetectable" ? "#93c5fd" : "#d8b4fe", borderColor: engine === "undetectable" ? "rgba(59,130,246,0.2)" : "rgba(168,85,247,0.2)" }}
                  >
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: engine === "undetectable" ? "#3b82f6" : "#a855f7", boxShadow: `0 0 6px ${engine === "undetectable" ? "#3b82f6" : "#a855f7"}` }} />
                    {engine === "undetectable" ? "Undetectable AI" : "StealthGPT"}
                  </div>
                </div>
              </div>
            )}

            {/* Result card */}
            <div className={styles.resultCard}>
              <div className={styles.resultCardHeader}>
                <div className={styles.resultCardLabel}>
                  {streaming && <span className={styles.streamDot} />}
                  {streaming ? "Streaming result…" : "Humanized content"}
                </div>
              </div>
              <div className={styles.resultText}>
                {displayed}
                {streaming && <span className={styles.cursor} />}
              </div>
            </div>

            {/* Actions */}
            <div className={styles.actionsRow}>
              {/* Copy */}
              <button
                className={`${styles.copyBtn} ${copied ? styles.copyBtnDone : ""}`}
                onClick={handleCopy}
                disabled={!result || streaming}
              >
                {copied ? (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    Copied!
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                    </svg>
                    Copy Result
                  </>
                )}
              </button>

              {/* Detector links */}
              <div className={styles.detectBtnGroup}>
                <a
                  href="https://gptzero.me"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${styles.detectBtn} ${styles.detectBtnGptZero}`}
                >
                  {/* GPTZero icon */}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.3-4.3" />
                  </svg>
                  GPTZero
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ opacity: 0.5 }}>
                    <path d="M7 7h10v10M7 17 17 7" />
                  </svg>
                </a>
                <a
                  href="https://www.turnitin.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${styles.detectBtn} ${styles.detectBtnTurnitin}`}
                >
                  {/* Turnitin icon */}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                  Turnitin
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ opacity: 0.5 }}>
                    <path d="M7 7h10v10M7 17 17 7" />
                  </svg>
                </a>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
