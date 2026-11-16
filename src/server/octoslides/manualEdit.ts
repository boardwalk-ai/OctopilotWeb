import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { runInSandbox } from "@/server/octoslides/sandbox";
import { applyMarks } from "@/server/octoslides/marks";
import { emit, finishRun, type OctoSlidesRun } from "@/server/octoslides/runs";
import { deckInfo, writeTextFile } from "@/server/octoslides/workspace";

/**
 * A user's direct text edit from the preview (no AI, no cost). Stored in
 * edits.json so it survives later rebuilds of build.js, applied to the current
 * deck by postbuild, then validated and re-rendered. The caller has claimed the run.
 */

type ElementEdit = { slide: number; name: string; x?: number; y?: number; w?: number; h?: number; rot?: number; fill?: string; animation?: string; animations?: Array<{ effect: string; trigger?: string; durationMs?: number; delayMs?: number }>; format?: { bold?: boolean; italic?: boolean; underline?: boolean; align?: string; color?: string; size?: number; font?: string }; deleted?: boolean };
type TransitionEdit = { slide: number; transition: "fade" | "push" | "wipe" | "dissolve" | "zoom" | "morph" | "none" };
type AddedEdit = { slide: number; add: true; name: string; kind: "text" | "shape"; text: string; x: number; y: number; w: number; h: number; fill: string };
type EditsFile = { text: Array<{ slide: number; name: string; text: string }>; elements: ElementEdit[]; transitions: TransitionEdit[]; added: AddedEdit[] };
const MAX_EDITS = 300;

export type ManualEdit = { slide: number; name: string; text: string } | ElementEdit | TransitionEdit | AddedEdit;

export async function applyManualTextEdit(run: OctoSlidesRun, edit: ManualEdit): Promise<void> {
  return applyManualEdits(run, [edit]);
}

/** Merge one edit into the stored edits (a later edit to the same thing replaces the earlier one). */
function merge(current: EditsFile, edit: ManualEdit) {
  if ("add" in edit) current.added.push(edit);
  else if ("transition" in edit) {
    current.transitions = current.transitions.filter((e) => e.slide !== edit.slide);
    current.transitions.push(edit);
  } else if ("text" in edit) {
    current.text = current.text.filter((e) => !(e.slide === edit.slide && e.name === edit.name));
    current.text.push(edit);
  } else {
    const previous = current.elements.find((e) => e.slide === edit.slide && e.name === edit.name);
    current.elements = current.elements.filter((e) => !(e.slide === edit.slide && e.name === edit.name));
    current.elements.push({ ...previous, ...edit, ...(edit.format ? { format: { ...previous?.format, ...edit.format } } : {}) });
  }
}

/**
 * Apply a batch of direct edits with one rebuild. The deck is ready (deck_ready)
 * as soon as postbuild has run; validation and the LibreOffice preview run side
 * by side afterwards, so the editor can redraw from the new deck straight away.
 */
export async function applyManualEdits(run: OctoSlidesRun, edits: ManualEdit[]): Promise<void> {
  const id = `edit-${Date.now()}`;
  const slidesTouched = [...new Set(edits.map((e) => e.slide))].sort((a, b) => a - b);
  emit(run, { type: "tool_started", id, name: "manual_edit", summary: `slide ${slidesTouched.join(", ")}` });
  try {
    const stored = await readFile(join(run.dir, "edits.json"), "utf8")
      .then((t) => JSON.parse(t) as Partial<EditsFile>)
      .catch(() => ({}) as Partial<EditsFile>);
    const current: EditsFile = {
      text: Array.isArray(stored.text) ? stored.text : [],
      elements: Array.isArray(stored.elements) ? stored.elements : [],
      transitions: Array.isArray(stored.transitions) ? stored.transitions : [],
      added: Array.isArray(stored.added) ? stored.added : [],
    };
    for (const edit of edits) merge(current, edit);
    await writeTextFile(run.dir, "edits.json", JSON.stringify({ text: current.text.slice(-MAX_EDITS), elements: current.elements.slice(-MAX_EDITS), transitions: current.transitions, added: current.added.slice(-MAX_EDITS) }, null, 2));

    const post = await runInSandbox(run.dir, ["deck-post"], { timeoutMs: 60_000 });
    if (post.exitCode !== 0 || post.timedOut) throw new Error(`Could not apply the edit: ${(post.stderr || post.stdout).slice(-300)}`);
    const names = new Set(edits.flatMap((e) => ("name" in e && !("add" in e) ? [e.name] : [])));
    const warning = post.stderr.split("\n").find((l) => l.startsWith("warning:") && [...names].some((n) => l.includes(`"${n}"`)));
    if (warning) throw new Error(warning.replace(/^warning:\s*/, ""));

    await applyMarks(run);
    run.deckVersion += 1;
    const version = run.deckVersion;
    const info = await deckInfo(run.dir);
    emit(run, { type: "deck_ready", bytes: info.bytes, version });

    const [validate, render] = await Promise.all([
      runInSandbox(run.dir, ["deck-validate"], { timeoutMs: 60_000 }),
      runInSandbox(run.dir, ["deck-render", "100"], { timeoutMs: 120_000, memoryMb: 1536, cpus: 2 }),
    ]);
    if (validate.exitCode === 0 && !validate.timedOut) run.lastValidatedVersion = version;
    if (render.exitCode !== 0 || render.timedOut) throw new Error("The edit was saved but the preview could not be re-rendered.");
    const slides = render.stdout
      .split("\n")
      .map((l) => l.match(/^slide-(\d+)\.png$/)?.[1])
      .filter(Boolean)
      .map(Number)
      .sort((a, b) => a - b);
    run.renderedVersion = version;
    emit(run, { type: "slides_rendered", slides, version });
    emit(run, { type: "tool_finished", id, name: "manual_edit", ok: true, summary: edits.length > 1 ? `${edits.length} edits on slide ${slidesTouched.join(", ")}` : `Edited slide ${slidesTouched[0]}` });
    finishRun(run, "idle");
  } catch (error) {
    emit(run, { type: "tool_finished", id, name: "manual_edit", ok: false, summary: (error as Error).message.slice(0, 200) });
    finishRun(run, "idle");
    throw error;
  }
}
