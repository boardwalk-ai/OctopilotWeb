import { chown, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join, normalize, relative, resolve, sep } from "node:path";

/**
 * One folder per run, mounted at /work in the sandbox:
 *   build.js (and any other text files the model writes)
 *   assets/   images fetched by the host (the sandbox has no network)
 *   out/      deck.pptx and render/slide-N.png, written by the sandbox
 */

export const WORK_ROOT = process.env.OCTOSLIDES_WORK_DIR || "/var/lib/octoslides";
const SANDBOX_UID = 10001;
const MAX_TEXT_FILE = 400 * 1024;
const TEXT_EXT = /\.(m?js|json|md|txt|csv|svg)$/i;
const SAFE_PATH = /^[A-Za-z0-9_\-./]+$/;

export class WorkspaceError extends Error {}

export async function ownToSandbox(path: string) {
  // The web app runs as root on the server; the sandbox runs as uid 10001 and must be able to write.
  if (typeof process.getuid === "function" && process.getuid() === 0) {
    await chown(path, SANDBOX_UID, SANDBOX_UID).catch(() => undefined);
  }
}

export async function createWorkspace(runId: string): Promise<string> {
  const dir = join(WORK_ROOT, runId);
  for (const sub of ["", "assets", "out"]) {
    await mkdir(join(dir, sub), { recursive: true, mode: 0o755 });
    await ownToSandbox(join(dir, sub));
  }
  return dir;
}

/** Resolves a model-supplied relative path, refusing anything outside the workspace. */
export function resolveInWorkspace(dir: string, path: string): string {
  if (typeof path !== "string" || !path || path.length > 200 || !SAFE_PATH.test(path) || path.includes("..")) {
    throw new WorkspaceError("Use a simple relative path like build.js or assets/logo.png.");
  }
  const full = resolve(dir, normalize(path));
  const rel = relative(dir, full);
  if (rel.startsWith("..") || rel.includes(`..${sep}`) || resolve(dir, rel) !== full) {
    throw new WorkspaceError("Path is outside the workspace.");
  }
  return full;
}

export async function writeTextFile(dir: string, path: string, content: string): Promise<number> {
  if (!TEXT_EXT.test(path)) throw new WorkspaceError("Only .js, .mjs, .json, .md, .txt, .csv and .svg files can be written.");
  if (path.startsWith("out/")) throw new WorkspaceError("out/ is written by the build script, not directly.");
  const bytes = Buffer.byteLength(content, "utf8");
  if (bytes > MAX_TEXT_FILE) throw new WorkspaceError(`File is ${bytes} bytes; the limit is ${MAX_TEXT_FILE}.`);
  const full = resolveInWorkspace(dir, path);
  await mkdir(join(full, ".."), { recursive: true });
  await writeFile(full, content, { mode: 0o644 });
  await ownToSandbox(full);
  return bytes;
}

export async function writeBinaryFile(dir: string, path: string, data: Uint8Array): Promise<void> {
  const full = resolveInWorkspace(dir, path);
  await mkdir(join(full, ".."), { recursive: true });
  await writeFile(full, data, { mode: 0o644 });
  await ownToSandbox(full);
}

export async function readTextFile(dir: string, path: string): Promise<string> {
  const full = resolveInWorkspace(dir, path);
  const info = await stat(full).catch(() => null);
  if (!info?.isFile()) throw new WorkspaceError(`${path} does not exist.`);
  if (!TEXT_EXT.test(path)) throw new WorkspaceError("Only text files can be read.");
  const text = await readFile(full, "utf8");
  return text.length > 60_000 ? `${text.slice(0, 60_000)}\n…[truncated]` : text;
}

export async function listFiles(dir: string): Promise<Array<{ path: string; bytes: number }>> {
  const out: Array<{ path: string; bytes: number }> = [];
  async function walk(sub: string) {
    for (const entry of await readdir(join(dir, sub), { withFileTypes: true })) {
      const rel = sub ? `${sub}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(rel);
      else out.push({ path: rel, bytes: (await stat(join(dir, rel))).size });
    }
  }
  await walk("");
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

export async function deckInfo(dir: string): Promise<{ exists: boolean; bytes: number; mtimeMs: number }> {
  const info = await stat(join(dir, "out", "deck.pptx")).catch(() => null);
  return info ? { exists: true, bytes: info.size, mtimeMs: info.mtimeMs } : { exists: false, bytes: 0, mtimeMs: 0 };
}

export async function removeWorkspace(dir: string) {
  if (!dir.startsWith(WORK_ROOT)) return;
  await rm(dir, { recursive: true, force: true });
}
