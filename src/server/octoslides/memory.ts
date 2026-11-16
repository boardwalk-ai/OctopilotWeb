import { query, withTransaction } from "@/server/db";
import type { OctoTool } from "@/server/octoslides/tools";

/**
 * Long-term memory for OctoSlides, after Ananta (spine + contradictions), with the
 * parts that broke there replaced: facts come in structured from the model (no
 * regex extraction, so "do not use X" can never be stored as "use X"), and they
 * live per user in Postgres.
 *
 *  - The "spine" is every active fact. It is small, so it is always put in the
 *    system prompt (no retrieval needed; prompt caching makes it nearly free).
 *  - A new value for a slot supersedes the old fact instead of deleting it, and
 *    recent changes are shown to the model as "was X, now Y".
 */

export const PREDICATES = {
  brand_color: "a brand / school color (hex)",
  font: "a font the user wants",
  theme: "light or dark slides",
  tone: "voice and tone (formal, playful…)",
  audience: "who they usually present to",
  organization: "their school, club or company",
  language: "the language decks should be in",
  title_style: "how titles should read (short, questions…)",
  density: "how much text per slide",
  logo: "a logo URL or description",
  citation_style: "how sources are cited",
  prefer: "something they like (one fact per thing)",
  avoid: "something they do not want (one fact per thing)",
} as const;
export type Predicate = keyof typeof PREDICATES;

/** Slots that hold many values: the object is part of the slot. */
const MULTI: ReadonlySet<string> = new Set(["prefer", "avoid", "brand_color", "font"]);
const MAX_FACTS = 60;

export type MemoryFact = {
  id: string;
  predicate: Predicate;
  object: string;
  polarity: 1 | -1;
  note: string | null;
  source: "agent" | "user";
  createdAt: string;
};

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
function slotOf(predicate: string, object: string) {
  return MULTI.has(predicate) ? `${predicate}|${norm(object)}` : predicate;
}

export async function activeFacts(userId: string): Promise<MemoryFact[]> {
  const rows = await query<{ id: string; predicate: Predicate; object: string; polarity: number; note: string | null; source: "agent" | "user"; created_at: Date }>(
    `SELECT id, predicate, object, polarity, note, source, created_at FROM octoslides_memory
      WHERE user_id = $1 AND superseded_at IS NULL ORDER BY confirmed_at DESC LIMIT $2`,
    [userId, MAX_FACTS],
  );
  return rows.map((r) => ({ id: r.id, predicate: r.predicate, object: r.object, polarity: r.polarity === -1 ? -1 : 1, note: r.note, source: r.source, createdAt: new Date(r.created_at).toISOString() }));
}

async function recentChanges(userId: string) {
  return query<{ predicate: string; old_object: string; old_polarity: number; new_object: string; new_polarity: number; at: Date }>(
    `SELECT o.predicate, o.object AS old_object, o.polarity AS old_polarity, n.object AS new_object, n.polarity AS new_polarity, o.superseded_at AS at
       FROM octoslides_memory o JOIN octoslides_memory n ON n.id = o.superseded_by
      WHERE o.user_id = $1 AND o.superseded_at > now() - interval '60 days'
      ORDER BY o.superseded_at DESC LIMIT 5`,
    [userId],
  );
}

function describe(predicate: string, object: string, polarity: number) {
  if (predicate === "avoid") return `avoid ${object}`;
  if (predicate === "prefer") return `likes ${object}`;
  return `${predicate.replace(/_/g, " ")}: ${polarity < 0 ? "not " : ""}${object}`;
}

/** The always-on memory block for the system prompt ("" when there is nothing). */
export async function memoryBlock(userId: string | null): Promise<string> {
  if (!userId) return "";
  const [facts, changes] = await Promise.all([activeFacts(userId).catch(() => []), recentChanges(userId).catch(() => [])]);
  if (!facts.length && !changes.length) return "";
  const lines = ["# What you remember about this user", "Apply these unless the current request says otherwise (the request wins; then update memory)."];
  for (const f of facts) lines.push(`- ${describe(f.predicate, f.object, f.polarity)}${f.note ? ` (${f.note})` : ""}`);
  if (changes.length) {
    lines.push("Recently changed (the newer one holds):");
    for (const c of changes) lines.push(`- was "${describe(c.predicate, c.old_object, c.old_polarity)}", now "${describe(c.predicate, c.new_object, c.new_polarity)}"`);
  }
  return lines.join("\n");
}

export async function rememberFact(
  userId: string,
  fact: { predicate: string; object: string; polarity?: number; note?: string | null; source?: "agent" | "user" },
): Promise<{ status: "stored" | "confirmed" | "replaced"; replaced?: string }> {
  if (!(fact.predicate in PREDICATES)) throw new Error(`Unknown predicate "${fact.predicate}". Use one of: ${Object.keys(PREDICATES).join(", ")}.`);
  const object = fact.object.trim().replace(/\s+/g, " ").slice(0, 200);
  if (!object) throw new Error("object is empty");
  const polarity = fact.polarity === -1 ? -1 : 1;
  const slot = slotOf(fact.predicate, object);
  const note = fact.note?.trim().slice(0, 300) || null;
  return withTransaction(async (client) => {
    const { rows } = await client.query<{ id: string; object: string; polarity: number }>(
      "SELECT id, object, polarity FROM octoslides_memory WHERE user_id = $1 AND slot = $2 AND superseded_at IS NULL FOR UPDATE",
      [userId, slot],
    );
    const current = rows[0];
    if (current && norm(current.object) === norm(object) && current.polarity === polarity) {
      await client.query("UPDATE octoslides_memory SET confirmed_at = now(), note = COALESCE($2, note) WHERE id = $1", [current.id, note]);
      return { status: "confirmed" as const };
    }
    const { rows: inserted } = await client.query<{ id: string }>(
      `INSERT INTO octoslides_memory (user_id, slot, predicate, object, polarity, note, source) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [userId, slot, fact.predicate, object, polarity, note, fact.source ?? "agent"],
    );
    if (current) {
      await client.query("UPDATE octoslides_memory SET superseded_at = now(), superseded_by = $2 WHERE id = $1", [current.id, inserted[0].id]);
      return { status: "replaced" as const, replaced: describe(fact.predicate, current.object, current.polarity) };
    }
    // keep the spine bounded: the oldest unconfirmed facts drop out
    await client.query(
      `UPDATE octoslides_memory SET superseded_at = now() WHERE id IN (
         SELECT id FROM octoslides_memory WHERE user_id = $1 AND superseded_at IS NULL ORDER BY confirmed_at DESC OFFSET $2)`,
      [userId, MAX_FACTS],
    );
    return { status: "stored" as const };
  });
}

export async function forgetFact(userId: string, id: string): Promise<boolean> {
  const rows = await query("UPDATE octoslides_memory SET superseded_at = now() WHERE id = $1 AND user_id = $2 AND superseded_at IS NULL RETURNING id", [id, userId]);
  return rows.length > 0;
}

export async function forgetSlot(userId: string, predicate: string, object?: string): Promise<number> {
  const rows = object
    ? await query("UPDATE octoslides_memory SET superseded_at = now() WHERE user_id = $1 AND slot = $2 AND superseded_at IS NULL RETURNING id", [userId, slotOf(predicate, object)])
    : await query("UPDATE octoslides_memory SET superseded_at = now() WHERE user_id = $1 AND predicate = $2 AND superseded_at IS NULL RETURNING id", [userId, predicate]);
  return rows.length;
}

// ── tools ────────────────────────────────────────────────────────────────────
export const remember: OctoTool = {
  name: "remember",
  description:
    `Store one durable fact about the USER (not about this deck) so future decks get it right without asking: their brand color, school, preferred tone, things they want or never want. Only what they said or clearly showed (e.g. they shortened every title by hand). One fact per call; a new value replaces the old one. Predicates: ${Object.entries(PREDICATES).map(([k, v]) => `${k} = ${v}`).join("; ")}.`,
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["predicate", "object"],
    properties: {
      predicate: { type: "string", enum: Object.keys(PREDICATES) },
      object: { type: "string", description: "The value, short: 'EF4444', 'dark', 'Yangon University', 'stock photos of handshakes'" },
      polarity: { type: "integer", enum: [1, -1], description: "-1 when it is a 'not' (rarely needed: prefer 'avoid')" },
      note: { type: "string", description: "Optional context, e.g. 'said on the composting deck'" },
    },
  },
  async execute(args, { run }) {
    if (!run.dataUserId) return { ok: false, content: JSON.stringify({ error: "Memory is unavailable for this account." }), summary: "No memory" };
    const result = await rememberFact(run.dataUserId, {
      predicate: String(args.predicate ?? ""),
      object: String(args.object ?? ""),
      polarity: Number(args.polarity) === -1 ? -1 : 1,
      note: typeof args.note === "string" ? args.note : null,
    });
    const what = describe(String(args.predicate), String(args.object), Number(args.polarity) === -1 ? -1 : 1);
    return {
      ok: true,
      content: JSON.stringify(result),
      summary: result.status === "replaced" ? `Updated: ${what} (was ${result.replaced})` : result.status === "confirmed" ? `Still true: ${what}` : `Remembered: ${what}`,
    };
  },
};

export const forget: OctoTool = {
  name: "forget",
  description: "Drop a remembered fact about the user when they say it no longer holds (and there is no new value to remember instead).",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["predicate"],
    properties: {
      predicate: { type: "string", enum: Object.keys(PREDICATES) },
      object: { type: "string", description: "For prefer / avoid / brand_color / font: which one" },
    },
  },
  async execute(args, { run }) {
    if (!run.dataUserId) return { ok: false, content: JSON.stringify({ error: "Memory is unavailable for this account." }), summary: "No memory" };
    const n = await forgetSlot(run.dataUserId, String(args.predicate ?? ""), typeof args.object === "string" ? args.object : undefined);
    return { ok: true, content: JSON.stringify({ forgotten: n }), summary: n ? `Forgot ${args.predicate}` : "Nothing to forget" };
  },
};
