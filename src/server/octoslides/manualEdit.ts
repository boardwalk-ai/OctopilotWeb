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

type ElementEdit = { slide: number; name: string; x?: number; y?: number; w?: number; h?: number; rot?: number; fill?: string; animation?: string; deleted?: boolean };
type TransitionEdit = { slide: number; transition: "fade" | "push" | "wipe" | "dissolve" | "zoom" | "morph" | "none" };
type EditsFile = { text: Array<{ slide: number; name: string; text: string }>; elements: ElementEdit[]; transitions: TransitionEdit[] };
const MAX_EDITS = 300;

export async function applyManualTextEdit(run: OctoSlidesRun, edit: ({ slide: number; name: string; text: string } | ElementEdit | TransitionEdit)): Promise<void> {
  const id = `edit-${Date.now()}`;
  emit(run, { type: "tool_started", id, name: "manual_edit", summary: `slide ${edit.slide}` });
  try {
    const current = await readFile(join(run.dir, "edits.json"), "utf8")
      .then((t) => JSON.parse(t) as Partial<EditsFile>)
      .catch(() => ({}) as Partial<EditsFile>);
    const text = Array.isArray(current.text) ? current.text.filter((e) => !(e.slide === edit.slide && "name" in edit && e.name === edit.name && "text" in edit)) : [];
    const elements = Array.isArray(current.elements) ? current.elements.filter((e) => !(e.slide === edit.slide && "name" in edit && e.name === edit.name && !("text" in edit))) : [];
    const transitions = Array.isArray(current.transitions) ? current.transitions.filter((e) => !(e.slide === edit.slide && "transition" in edit)) : [];
    if ("text" in edit) text.push(edit);
    else if ("transition" in edit) transitions.push(edit);
    else elements.push(edit);
    await writeTextFile(run.dir, "edits.json", JSON.stringify({ text: text.slice(-MAX_EDITS), elements: elements.slice(-MAX_EDITS), transitions }, null, 2));

    const post = await runInSandbox(run.dir, ["deck-post"], { timeoutMs: 60_000 });
    if (post.exitCode !== 0 || post.timedOut) throw new Error(`Could not apply the edit: ${(post.stderr || post.stdout).slice(-300)}`);
    const warning = post.stderr.split("\n").find((l) => l.startsWith("warning:") && "name" in edit && l.includes(`"${edit.name}"`));
    if (warning) throw new Error(warning.replace(/^warning:\s*/, ""));

    await applyMarks(run);
    run.deckVersion += 1;
    const info = await deckInfo(run.dir);
    emit(run, { type: "deck_ready", bytes: info.bytes, version: run.deckVersion });

    const validate = await runInSandbox(run.dir, ["deck-validate"], { timeoutMs: 60_000 });
    if (validate.exitCode === 0 && !validate.timedOut) run.lastValidatedVersion = run.deckVersion;

    const render = await runInSandbox(run.dir, ["deck-render", "100"], { timeoutMs: 120_000, memoryMb: 1536, cpus: 2 });
    if (render.exitCode !== 0 || render.timedOut) throw new Error("The edit was saved but the preview could not be re-rendered.");
    const slides = render.stdout
      .split("\n")
      .map((l) => l.match(/^slide-(\d+)\.png$/)?.[1])
      .filter(Boolean)
      .map(Number)
      .sort((a, b) => a - b);
    run.renderedVersion = run.deckVersion;
    emit(run, { type: "slides_rendered", slides, version: run.deckVersion });
    emit(run, { type: "tool_finished", id, name: "manual_edit", ok: true, summary: `Edited slide ${edit.slide}` });
    finishRun(run, "idle");
  } catch (error) {
    emit(run, { type: "tool_finished", id, name: "manual_edit", ok: false, summary: (error as Error).message.slice(0, 200) });
    finishRun(run, "idle");
    throw error;
  }
}
