"use client";

/**
 * Loading the Octopilot Presentation Engine (Rust -> WebAssembly, engine/octo-present,
 * built into public/octo-present) and preparing a deck for it: images decoded, reference
 * renders attached, fonts loaded. Shared by Present mode and the presenter window.
 */

export type EngineInstance = {
  slideCount(): number;
  aspect(): number;
  slide(): number;
  stepsLeft(): number;
  notes(index: number): string;
  mediaNames(): string[];
  mediaBytes(name: string): Uint8Array;
  setImage(name: string, image: HTMLImageElement): void;
  setReference(index: number, image: HTMLImageElement): void;
  fonts(): string[];
  fontsChanged(): void;
  next(now: number): boolean;
  prev(now: number): boolean;
  goto(index: number, now: number): void;
  render(ctx: CanvasRenderingContext2D, width: number, height: number, now: number): boolean;
  renderSlide(ctx: CanvasRenderingContext2D, width: number, height: number, index: number): void;
  free(): void;
};
type EngineModule = { default: (init?: unknown) => Promise<unknown>; Engine: new (bytes: Uint8Array) => EngineInstance };

const ENGINE_URL = "/octo-present/octo_present.js";
const WASM_URL = "/octo-present/octo_present_bg.wasm";
/** Metric-compatible stand-ins for the Office fonts, for devices that lack them. */
const FONT_CSS =
  "https://fonts.googleapis.com/css2?family=Carlito:ital,wght@0,400;0,700;1,400;1,700&family=Caladea:ital,wght@0,400;0,700;1,400;1,700&family=Arimo:ital,wght@0,400;0,700;1,400;1,700&display=swap";
const FALLBACK: Record<string, string> = { Calibri: "Carlito", Cambria: "Caladea", Arial: "Arimo" };

let modulePromise: Promise<EngineModule> | null = null;
export function loadEngine(): Promise<EngineModule> {
  modulePromise ??= (async () => {
    const mod = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ ENGINE_URL)) as EngineModule;
    await mod.default({ module_or_path: WASM_URL });
    return mod;
  })();
  return modulePromise;
}

function mime(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  return ext === "png" ? "image/png" : ext === "gif" ? "image/gif" : ext === "svg" ? "image/svg+xml" : ext === "webp" ? "image/webp" : "image/jpeg";
}

export function decodeImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function loadFonts(families: string[]) {
  if (!document.querySelector(`link[data-octo-present-fonts]`)) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = FONT_CSS;
    link.dataset.octoPresentFonts = "1";
    document.head.appendChild(link);
    await new Promise((r) => {
      link.onload = r;
      link.onerror = r;
      setTimeout(r, 2500);
    });
  }
  const wanted = new Set<string>();
  for (const f of families) {
    wanted.add(f);
    if (FALLBACK[f]) wanted.add(FALLBACK[f]);
  }
  await Promise.all([...wanted].flatMap((f) => ["400", "700"].map((w) => document.fonts.load(`${w} 24px "${f}"`).catch(() => undefined))));
}

/**
 * A ready engine for `pptx`. `references` maps 1-based slide numbers to rendered images
 * (charts and tables the engine cannot draw are cut from them). Returns the object URLs
 * it created, for the caller to revoke.
 */
export async function openDeck(pptx: ArrayBuffer, references?: Record<number, string>): Promise<{ engine: EngineInstance; urls: string[] }> {
  const mod = await loadEngine();
  const engine = new mod.Engine(new Uint8Array(pptx));
  const urls: string[] = [];
  await Promise.all([
    ...engine.mediaNames().map(async (name) => {
      const url = URL.createObjectURL(new Blob([engine.mediaBytes(name) as BlobPart], { type: mime(name) }));
      urls.push(url);
      const img = await decodeImage(url);
      if (img) engine.setImage(name, img);
    }),
    ...Object.entries(references ?? {}).map(async ([n, url]) => {
      const img = await decodeImage(url);
      if (img) engine.setReference(Number(n) - 1, img);
    }),
    loadFonts(engine.fonts()),
  ]);
  engine.fontsChanged();
  return { engine, urls };
}

/** Messages between Present mode and the presenter window (BroadcastChannel). */
export const PRESENTER_CHANNEL = "octoslides-presenter";
export type PresenterMessage =
  | { type: "hello" }
  | { type: "deck"; pptx: ArrayBuffer; references: Record<number, string> }
  | { type: "state"; slide: number; count: number; stepsLeft: number; ended: boolean; startedAt: number }
  | { type: "command"; action: "next" | "prev" | "goto" | "end"; index?: number }
  | { type: "closed" };
