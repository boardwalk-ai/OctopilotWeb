"use client";

import { useEffect, useState } from "react";
import { AuthService } from "@/services/AuthService";

type Policy = { freeWatermark: boolean; exemptEmails: string[] };

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const send = async (force: boolean) => {
    const token = await AuthService.getIdToken(force);
    if (!token) throw new Error("You need to be signed in as an admin.");
    return fetch(path, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}) },
    });
  };
  let res = await send(false);
  if (res.status === 401) res = await send(true);
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || "Admin request failed.");
  return data;
}

/** Brokeoctopus: who gets the Octopilot AI badge on OctoSlides decks. */
export default function OctoSlidesPolicyPanel({ refreshKey }: { refreshKey?: number }) {
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [saved, setSaved] = useState<Policy | null>(null);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    adminFetch<{ policy: Policy }>("/api/admin/octoslides")
      .then((d) => {
        setPolicy(d.policy);
        setSaved(d.policy);
      })
      .catch((e: Error) => setError(e.message));
  }, [refreshKey]);

  const dirty = JSON.stringify(policy) !== JSON.stringify(saved);

  const save = async () => {
    if (!policy) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const d = await adminFetch<{ policy: Policy }>("/api/admin/octoslides", { method: "PUT", body: JSON.stringify(policy) });
      setPolicy(d.policy);
      setSaved(d.policy);
      setMessage("Saved. New builds and downloads use it right away.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const addEmail = () => {
    const value = email.trim().toLowerCase();
    if (!policy || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setError("Enter a valid email address.");
      return;
    }
    setError(null);
    if (!policy.exemptEmails.includes(value)) setPolicy({ ...policy, exemptEmails: [...policy.exemptEmails, value].sort() });
    setEmail("");
  };

  if (!policy) {
    return <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-sm text-white/50">{error ?? "Loading OctoSlides policy…"}</div>;
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h3 className="text-[15px] font-semibold text-white">Free plan watermark</h3>
            <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-white/50">
              Free (guest) decks get the Octopilot AI badge in the bottom-right corner of every slide. Users cannot remove it and neither can the designer
              model; it is stamped on the server after every build and on every download. Pro users can switch it off themselves.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={policy.freeWatermark}
            onClick={() => setPolicy({ ...policy, freeWatermark: !policy.freeWatermark })}
            className={`relative h-7 w-12 shrink-0 rounded-full transition ${policy.freeWatermark ? "bg-red-500" : "bg-white/15"}`}
          >
            <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${policy.freeWatermark ? "left-6" : "left-1"}`} />
          </button>
        </div>
        <p className="mt-3 text-[12px] text-white/35">Every deck, on every plan, always carries Octopilot AI in its document properties (creator, application, deck id).</p>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
        <h3 className="text-[15px] font-semibold text-white">Released accounts</h3>
        <p className="mt-1 text-[13px] text-white/50">Free accounts that may switch the badge off, like Pro users.</p>
        <div className="mt-4 flex gap-2">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addEmail()}
            placeholder="name@example.com"
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-red-500/50"
          />
          <button type="button" onClick={addEmail} className="rounded-lg border border-white/15 px-3 py-2 text-sm text-white/80 hover:bg-white/[0.06]">
            Add
          </button>
        </div>
        <ul className="mt-3 divide-y divide-white/[0.06]">
          {policy.exemptEmails.length === 0 && <li className="py-2 text-[13px] text-white/35">No accounts released.</li>}
          {policy.exemptEmails.map((e) => (
            <li key={e} className="flex items-center justify-between py-2 text-[13px] text-white/75">
              {e}
              <button type="button" onClick={() => setPolicy({ ...policy, exemptEmails: policy.exemptEmails.filter((x) => x !== e) })} className="text-[12px] text-white/40 hover:text-red-300">
                Remove
              </button>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex items-center gap-3">
        <button type="button" onClick={() => void save()} disabled={!dirty || saving} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black disabled:opacity-30">
          {saving ? "Saving…" : "Save changes"}
        </button>
        {error && <p className="text-[13px] text-red-300">{error}</p>}
        {message && !dirty && <p className="text-[13px] text-emerald-300/80">{message}</p>}
      </div>
    </div>
  );
}
