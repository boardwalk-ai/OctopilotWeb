"use client";

import { useEffect, useRef, useState } from "react";
import { HumanizerService } from "@/services/HumanizerService";
import { CreditService, CreditDeductionError } from "@/services/CreditService";
import { AppHeader, LogoNav, MainHeaderActions } from "@/components/header";
import styles from "./HumanizerHubView.module.css";

// ── Types ─────────────────────────────────────────────────────────────────────

type Engine = "undetectable" | "stealthgpt";

type UndetectableParams = { readability: string; purpose: string; strength: string };
type StealthParams = { educationLevel: string; strength: string; detector: string; rephrase: boolean };

// ── Utility ───────────────────────────────────────────────────────────────────

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// ── Param select component ────────────────────────────────────────────────────

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

  const openClass =
    engine === "undetectable" ? styles.selectOpenBlue : styles.selectOpenPurple;

  return (
    <div>
      <div className={styles.paramLabel}>{label}</div>
      <div className={styles.selectWrap} ref={ref}>
        <button
          type="button"
          className={`${styles.selectBtn} ${open ? openClass : ""}`}
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
            style={{
              opacity: 0.5,
              transform: open ? "rotate(180deg)" : "rotate(0)",
              transition: "transform 0.15s",
              flexShrink: 0,
            }}
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
                {value === opt ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                ) : (
                  <span style={{ width: 12, display: "inline-block" }} />
                )}
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
    rephrase: true,
  });

  // ── Processing / error
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Result & typewriter stream
  const [result, setResult] = useState("");
  const [displayed, setDisplayed] = useState("");
  const [streaming, setStreaming] = useState(false);
  const streamRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamIndexRef = useRef(0);

  // ── Copy
  const [copied, setCopied] = useState(false);

  // Derived counts
  const inputWords = countWords(content);
  const resultWords = countWords(result);
  const wordDelta = resultWords - inputWords;

  // ── Typewriter animation ──────────────────────────────────────────────────

  useEffect(() => {
    if (!result) return;
    setDisplayed("");
    setStreaming(true);
    streamIndexRef.current = 0;

    const CHUNK = 4;
    const BASE_DELAY = 12;
    const JITTER = 8;

    const tick = () => {
      const idx = streamIndexRef.current;
      if (idx >= result.length) { setStreaming(false); return; }
      const next = Math.min(idx + CHUNK, result.length);
      setDisplayed(result.slice(0, next));
      streamIndexRef.current = next;
      streamRef.current = setTimeout(tick, BASE_DELAY + Math.random() * JITTER);
    };

    streamRef.current = setTimeout(tick, 60);
    return () => { if (streamRef.current) clearTimeout(streamRef.current); };
  }, [result]);

  // ── Humanize ─────────────────────────────────────────────────────────────

  const handleHumanize = async () => {
    if (!content.trim() || isProcessing) return;
    const words = countWords(content);
    setIsProcessing(true);
    setError(null);
    setResult("");
    setDisplayed("");
    try {
      // Gate on OctoCredits (cost-based, humanizer rate) before spending API cost.
      await CreditService.ensureSufficientHumanizerCreditsForWords(words);

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

      // Charge only after a successful humanization.
      await CreditService.deductHumanizerCreditsForWords(words, {
        idempotencyKey: CreditService.createDeductionKey(`humanizerhub:${engine}:${words}`),
      });

      setResult(output);
      setPage(2);
    } catch (err) {
      setError(
        err instanceof CreditDeductionError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Humanization failed. Please try again."
      );
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

  // ── Redo ─────────────────────────────────────────────────────────────────

  const handleRedo = () => {
    if (streamRef.current) clearTimeout(streamRef.current);
    setPage(1);
    setResult("");
    setDisplayed("");
    setStreaming(false);
    setError(null);
  };

  // ── Engine colors ─────────────────────────────────────────────────────────

  const engineColor = engine === "undetectable" ? "#3b82f6" : "#a855f7";
  const engineColorAlpha = engine === "undetectable" ? "rgba(59,130,246,0.18)" : "rgba(168,85,247,0.18)";
  const engineTextColor = engine === "undetectable" ? "#93c5fd" : "#d8b4fe";

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={styles.shell}>

      {/* ── Global app header (plan + credits + bell + store + save + report + profile) ── */}
      <AppHeader left={<LogoNav />} right={<MainHeaderActions />} />
      <div style={{ height: 64, flexShrink: 0 }} aria-hidden />

      {/* ── Loading overlay ── */}
      {isProcessing && (
        <div className={styles.loadingOverlay}>
          <div className={styles.loadingCard}>
            <div className={styles.loadingTopLine} />
            <div className={`${styles.loadingOrb} ${styles.loadingOrbL}`} />
            <div className={`${styles.loadingOrb} ${styles.loadingOrbR}`} />

            <div className={styles.loadingIconRing}>
              <div className={styles.loadingRingBase} />
              <div className={styles.loadingRingSpin} />
              <div className={styles.loadingRingInner}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m12 3 1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3L12 3Z" />
                </svg>
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

      {/* ── Slide track ── */}
      <div className={`${styles.pageTrack} ${page === 2 ? styles.onPage2 : ""}`}>

        {/* ════════════════════════════════ PAGE 1 ════════════════════════════════ */}
        <div className={styles.page}>

          {/* Top nav */}
          <div className={styles.topNav}>
            <button className={styles.backBtn} onClick={onBack}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="m15 18-6-6 6-6" />
              </svg>
              Back
            </button>
            <div className={styles.badge}>
              <span className={styles.badgeDot} />
              Humanizer Hub
            </div>
          </div>

          {/* Split body */}
          <div className={styles.p1Body}>

            {/* ── Left: input ── */}
            <div className={styles.p1Left}>
              <div className={styles.p1LeftHead}>
                <h1 className={styles.heroTitle}>
                  Make your content<br />
                  <span>undetectable.</span>
                </h1>
                <p className={styles.heroSub}>
                  Paste your AI-generated text, choose an engine and parameters, then get a humanized version that bypasses AI detection.
                </p>
              </div>

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

              {/* Input card — fills remaining height */}
              <div className={styles.inputCard}>
                <div className={styles.inputCardHeader}>
                  <span className={styles.inputCardLabel}>Your Content</span>
                  <span className={`${styles.wordCount} ${inputWords > 0 ? styles.hasContent : ""}`}>
                    {inputWords > 0 ? `${inputWords} words` : "0 words"}
                  </span>
                </div>
                <textarea
                  className={styles.textarea}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Paste your AI-generated essay, article, or any text here…"
                />
                <div className={styles.inputCardFooter}>
                  <button
                    className={styles.clearBtn}
                    onClick={() => setContent("")}
                    disabled={!content}
                  >
                    Clear
                  </button>
                  <span className={styles.charCount}>
                    {content.length.toLocaleString()} chars
                  </span>
                </div>
              </div>
            </div>

            {/* ── Right: config ── */}
            <div className={styles.p1Right}>

              {/* Engine selection */}
              <div>
                <div className={styles.sectionLabel}>Choose Engine</div>
                <div className={styles.engineStack}>

                  {/* Undetectable AI */}
                  <div
                    className={`${styles.engineCard} ${engine === "undetectable" ? styles.activeUndetectable : ""}`}
                    onClick={() => setEngine("undetectable")}
                  >
                    <div className={styles.engineCardGlow} />
                    <div className={styles.engineCardRow}>
                      <div
                        className={styles.engineDot}
                        style={{
                          background: "#3b82f6",
                          boxShadow: engine === "undetectable" ? "0 0 8px #3b82f6" : "none",
                        }}
                      />
                      <span className={styles.engineCardName}>Undetectable AI</span>
                      <span className={`${styles.engineBadge} ${styles.engineBadgeRec}`}>Recommended</span>
                      <div
                        className={styles.checkRing}
                        style={engine === "undetectable" ? { background: "#3b82f6", borderColor: "#3b82f6" } : {}}
                      >
                        {engine === "undetectable" && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5">
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                        )}
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
                    <div className={styles.engineCardRow}>
                      <div
                        className={styles.engineDot}
                        style={{
                          background: "#a855f7",
                          boxShadow: engine === "stealthgpt" ? "0 0 8px #a855f7" : "none",
                        }}
                      />
                      <span className={styles.engineCardName}>StealthGPT</span>
                      <span className={`${styles.engineBadge} ${styles.engineBadgePower}`}>Powerful</span>
                      <div
                        className={styles.checkRing}
                        style={engine === "stealthgpt" ? { background: "#a855f7", borderColor: "#a855f7" } : {}}
                      >
                        {engine === "stealthgpt" && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5">
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                        )}
                      </div>
                    </div>
                    <p className={styles.engineCardDesc}>
                      Aggressive rewriting with rephrase mode. Targets specific AI detectors.
                    </p>
                  </div>
                </div>
              </div>

              {/* Parameters */}
              <div
                className={styles.paramsBox}
                style={{
                  borderColor: engine === "undetectable"
                    ? "rgba(59,130,246,0.18)"
                    : "rgba(168,85,247,0.18)",
                }}
              >
                <div className={styles.sectionLabel}>
                  {engine === "undetectable" ? "Undetectable AI" : "StealthGPT"} Parameters
                </div>

                {engine === "undetectable" ? (
                  <div className={styles.paramsGrid1}>
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
                  <div className={styles.paramsGrid1}>
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
                    {/* Rephrase always enabled — no toggle shown */}
                  </div>
                )}
              </div>

              {/* CTA */}
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
              <p style={{ textAlign: "center", fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", color: "rgba(255,255,255,0.32)", marginTop: 8 }}>
                Costs ~{CreditService.estimateCharge(0, inputWords, 0).toLocaleString()} OctoCredits
              </p>

            </div>{/* /p1Right */}
          </div>{/* /p1Body */}
        </div>{/* /page 1 */}

        {/* ════════════════════════════════ PAGE 2 ════════════════════════════════ */}
        <div className={styles.page}>

          {/* Top nav */}
          <div className={styles.topNav}>
            <button className={styles.backBtn} onClick={handleRedo}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="m15 18-6-6 6-6" />
              </svg>
              Back
            </button>
            <div className={styles.badge}>
              <span className={styles.badgeDot} />
              Humanizer Hub
            </div>
          </div>

          {/* Split body */}
          <div className={styles.p2Body}>

            {/* ── Left: result ── */}
            <div className={styles.p2Left}>
              <div className={styles.p2LeftHead}>
                <div>
                  <div className={styles.p2Title}>Humanized Result</div>
                  <div className={styles.p2Sub}>
                    via {engine === "undetectable" ? "Undetectable AI" : "StealthGPT"} · ready to use
                  </div>
                </div>
              </div>

              <div className={styles.resultCard}>
                <div className={styles.resultCardHeader}>
                  <div className={styles.resultCardLabel}>
                    {streaming && <span className={styles.streamDot} />}
                    {streaming ? "Streaming result…" : "Humanized content"}
                  </div>
                  {/* Engine pill in header */}
                  <div
                    className={styles.enginePill}
                    style={{
                      background: engineColorAlpha,
                      color: engineTextColor,
                    }}
                  >
                    <div
                      className={styles.engineDot}
                      style={{ background: engineColor, boxShadow: `0 0 6px ${engineColor}` }}
                    />
                    {engine === "undetectable" ? "Undetectable AI" : "StealthGPT"}
                  </div>
                </div>
                <div className={styles.resultText}>
                  {displayed}
                  {streaming && <span className={styles.cursor} />}
                </div>
              </div>
            </div>

            {/* ── Right: actions ── */}
            <div className={styles.p2Right}>

              {/* Stats */}
              <div>
                <div className={styles.sectionLabel}>Statistics</div>
                <div className={styles.statsStack}>
                  <div className={styles.statRow}>
                    <span className={styles.statRowLabel}>Words before</span>
                    <span className={styles.statRowValue}>{inputWords.toLocaleString()}</span>
                  </div>
                  <div className={styles.statRow}>
                    <span className={styles.statRowLabel}>Words after</span>
                    <span className={styles.statRowValue}>{resultWords.toLocaleString()}</span>
                  </div>
                  {inputWords > 0 && resultWords > 0 && (
                    <div className={styles.statRow}>
                      <span className={styles.statRowLabel}>Change</span>
                      <span className={styles.statDelta}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          {wordDelta >= 0 ? <path d="m18 15-6-6-6 6" /> : <path d="m6 9 6 6 6-6" />}
                        </svg>
                        {wordDelta >= 0 ? "+" : ""}{wordDelta} words
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Copy button */}
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
              <div>
                <div className={styles.sectionLabel}>Verify with Detectors</div>
                <div className={styles.detectGroup}>
                  <a
                    href="https://gptzero.me"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${styles.detectBtn} ${styles.detectBtnGptZero}`}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
                    </svg>
                    GPTZero
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={styles.detectBtnExtIcon}>
                      <path d="M7 7h10v10M7 17 17 7" />
                    </svg>
                  </a>
                  <a
                    href="https://www.turnitin.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${styles.detectBtn} ${styles.detectBtnTurnitin}`}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                    Turnitin
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={styles.detectBtnExtIcon}>
                      <path d="M7 7h10v10M7 17 17 7" />
                    </svg>
                  </a>
                </div>
              </div>

              {/* Redo — pushes to bottom on desktop via margin-top: auto */}
              <button className={styles.redoBtn} onClick={handleRedo}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
                Redo Humanization
              </button>

            </div>{/* /p2Right */}
          </div>{/* /p2Body */}
        </div>{/* /page 2 */}

      </div>{/* /pageTrack */}
    </div>
  );
}
