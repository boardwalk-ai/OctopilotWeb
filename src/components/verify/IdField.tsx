"use client";

import { useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";

const KEY_LENGTH = 8;
const SERIAL_LENGTH = 6;
const TOTAL = KEY_LENGTH + SERIAL_LENGTH;

/** Keeps only what can go in the cells: 8 key chars, then 6 digits. */
function sanitize(raw: string): string {
  let value = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (value.startsWith("OCTO")) value = value.slice(4);
  let out = "";
  for (const ch of value) {
    if (out.length >= TOTAL) break;
    if (out.length >= KEY_LENGTH && !/[0-9]/.test(ch)) continue;
    out += ch;
  }
  return out;
}

function fromId(id?: string): string {
  return id ? sanitize(id) : "";
}

type IdFieldProps = {
  defaultId?: string;
  compact?: boolean;
  buttonLabel?: string;
  autoFocus?: boolean;
};

export default function IdField({ defaultId, compact = false, buttonLabel = "Verify", autoFocus = false }: IdFieldProps) {
  const router = useRouter();
  const inputId = useId();
  const helpId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(() => fromId(defaultId));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const key = value.slice(0, KEY_LENGTH);
  const serial = value.slice(KEY_LENGTH);
  const fullId = `OCTO-${key}-${serial}`;

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (value.length < TOTAL) {
      const left = TOTAL - value.length;
      setError(`${left} more character${left === 1 ? "" : "s"} to go. IDs have 8 letters or numbers, then 6 digits.`);
      inputRef.current?.focus();
      return;
    }
    setError(null);
    setBusy(true);
    router.push(`/verify/${fullId}`);
  };

  const cells: { ch: string; kind: "fixed" | "sep" | "key" | "serial"; index?: number }[] = [
    ..."OCTO".split("").map((ch) => ({ ch, kind: "fixed" as const })),
    { ch: "-", kind: "sep" },
    ...Array.from({ length: KEY_LENGTH }, (_, i) => ({ ch: value[i] ?? "", kind: "key" as const, index: i })),
    { ch: "-", kind: "sep" },
    ...Array.from({ length: SERIAL_LENGTH }, (_, i) => ({
      ch: value[KEY_LENGTH + i] ?? "",
      kind: "serial" as const,
      index: KEY_LENGTH + i,
    })),
  ];

  return (
    <form className={`ov-idform${compact ? " ov-idform--compact" : ""}`} onSubmit={onSubmit} noValidate>
      <label htmlFor={inputId} className="visually-hidden">
        Certificate ID
      </label>
      <div className="ov-idfield" data-invalid={error ? "true" : "false"} onClick={() => inputRef.current?.focus()}>
        <div className="ov-cells" aria-hidden="true">
          {cells.map((cell, position) => {
            if (cell.kind === "fixed" || cell.kind === "sep") {
              return (
                <span key={position} className={`ov-cell ov-cell--${cell.kind}`}>
                  {cell.ch}
                </span>
              );
            }
            const isEmpty = !cell.ch;
            const isNext = cell.index === value.length;
            return (
              <span
                key={position}
                className={`ov-cell${isEmpty ? " ov-cell--empty" : ""}${isNext ? " ov-cell--next" : ""}`}
              >
                {cell.ch ? (
                  <span key={cell.ch} className="ov-cell__glyph">
                    {cell.ch}
                  </span>
                ) : null}
              </span>
            );
          })}
        </div>
        <input
          ref={inputRef}
          id={inputId}
          name="certificateId"
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          autoFocus={autoFocus}
          aria-describedby={helpId}
          aria-invalid={error ? true : undefined}
          value={value}
          maxLength={TOTAL + 6}
          onChange={(event) => {
            setValue(sanitize(event.target.value));
            if (error) setError(null);
          }}
          disabled={busy}
        />
      </div>
      <p id={helpId} className="ov-idhelp" data-tone={error ? "error" : "help"} role={error ? "alert" : undefined}>
        {error ?? "Letters and numbers only. Paste the whole ID or type it in."}
      </p>
      <button type="submit" className="ov-btn" aria-busy={busy ? "true" : undefined} disabled={busy}>
        {busy ? "Opening the record…" : buttonLabel}
      </button>
    </form>
  );
}
