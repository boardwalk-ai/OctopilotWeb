// =============================================================================
// OctopilotSlides — Core Type Definitions
// Single source of truth for all slide data structures.
// Both the web renderer and PptxGenJS renderer consume these types.
// Both user edits (property panel) and AI edits (tool calls) write to these types.
// =============================================================================

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/** All positions and sizes are stored as percentages (0–100) of slide dimensions.
 *  At render time: x_px = (x / 100) * SLIDE_W
 *  At PPTX export: x_emu = (x / 100) * 9_144_000
 */
export type Rect = {
  x: number; // % from left edge
  y: number; // % from top edge
  w: number; // % of slide width
  h: number; // % of slide height
};

// ---------------------------------------------------------------------------
// Background
// ---------------------------------------------------------------------------

export type Background =
  | { type: "solid"; color: string }
  | { type: "gradient"; from: string; to: string; angle: number }
  | {
      type: "image";
      src: string;
      overlay?: string;
      overlayOpacity?: number; // 0–1
    };

// ---------------------------------------------------------------------------
// Animations
// ---------------------------------------------------------------------------

export type AnimationTrigger =
  | "entrance"
  | "exit"
  | "emphasis"
  | "onClick"
  | "withPrev"
  | "afterPrev";

/** Entrance animation types — sourced from PPTX animation vocabulary.
 *  Guarantees .pptx export fidelity. Web renderer implements same effects via GSAP/CSS.
 */
export type EntranceAnimationType =
  | "appear"
  | "fade"
  | "flyIn"
  | "floatIn"
  | "zoomIn"
  | "wipe"
  | "bounce"
  | "swivel"
  | "grow";

export type ExitAnimationType =
  | "disappear"
  | "fadeOut"
  | "flyOut"
  | "zoomOut"
  | "collapse";

export type EmphasisAnimationType =
  | "pulse"
  | "spin"
  | "teeter"
  | "flash"
  | "boldReveal"
  | "wiggle";

export type AnimationType =
  | EntranceAnimationType
  | ExitAnimationType
  | EmphasisAnimationType;

export type AnimationSpec = {
  trigger: AnimationTrigger;
  type: AnimationType;
  direction?: "fromBottom" | "fromTop" | "fromLeft" | "fromRight";
  duration: number; // milliseconds
  delay: number; // milliseconds
  easing?: "linear" | "easeIn" | "easeOut" | "easeInOut" | "bounce";
};

// ---------------------------------------------------------------------------
// Slide Transitions
// ---------------------------------------------------------------------------

export type TransitionSpec = {
  type: "fade" | "push" | "wipe" | "zoom" | "split" | "morph" | "none";
  duration: number; // milliseconds
  direction?: "left" | "right" | "up" | "down";
};

// ---------------------------------------------------------------------------
// Element Styles
// ---------------------------------------------------------------------------

export type TextStyle = {
  fontSize: number; // pt
  fontWeight: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
  fontFamily: string; // must exist in FontMap
  color: string; // hex
  align: "left" | "center" | "right" | "justify";
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  lineHeight?: number; // multiplier e.g. 1.5
  letterSpacing?: number; // em
  opacity?: number; // 0–1
};

export type ShapeStyle = {
  fill: string; // hex or "transparent"
  stroke?: string; // hex
  strokeWidth?: number; // px
  opacity?: number; // 0–1
  cornerRadius?: number; // px, for rectangle only
  rotation?: number; // degrees
};

export type ImageStyle = {
  objectFit: "cover" | "contain" | "fill";
  borderRadius?: number; // px
  opacity?: number; // 0–1
  rotation?: number; // degrees
};

export type IconStyle = {
  color: string; // hex
  size: number; // pt
  opacity?: number; // 0–1
};

// ---------------------------------------------------------------------------
// Elements
// ---------------------------------------------------------------------------

/** Element IDs follow this convention:
 *  Standard:  "{slideId}_{role}_{index?}"  e.g. "slide_001_title", "slide_001_body_1"
 *  Morph:     "!!{name}"                   e.g. "!!hero_shape", "!!story_circle"
 *  Morph IDs persist across slides — PowerPoint uses same-named elements for Morph transition.
 */

export type TextVariant =
  | "title"
  | "subtitle"
  | "body"
  | "caption"
  | "quote"
  | "label"
  | "stat";

export type TextElement = {
  id: string;
  type: "text";
  variant: TextVariant;
  content: string;
  position: Rect;
  style: TextStyle;
  animation?: AnimationSpec;
};

export type ShapeType =
  | "rectangle"
  | "circle"
  | "oval"
  | "triangle"
  | "arrow"
  | "diamond"
  | "hexagon"
  | "parallelogram"
  | "speechBubble"
  | "star"
  | "line";

export type ShapeElement = {
  id: string;
  type: "shape";
  shape: ShapeType;
  position: Rect;
  style: ShapeStyle;
  animation?: AnimationSpec;
};

export type ImageSourceType = "unsplash" | "user_upload" | "ai_generated" | "url";

export type ImageElement = {
  id: string;
  type: "image";
  src: string; // URL — fetched + embedded as base64 at PPTX export time
  sourceType: ImageSourceType;
  position: Rect;
  style: ImageStyle;
  animation?: AnimationSpec;
};

export type IconElement = {
  id: string;
  type: "icon";
  name: string; // Lucide icon name e.g. "Zap", "ArrowRight"
  position: Rect;
  style: IconStyle;
  animation?: AnimationSpec;
};

export type SlideElement =
  | TextElement
  | ShapeElement
  | ImageElement
  | IconElement;

// ---------------------------------------------------------------------------
// Design System — Archetype & Voice
// ---------------------------------------------------------------------------

/** The visual personality of an individual slide.
 *  AI picks one per slide. Same archetype cannot repeat on consecutive slides.
 *  See OctopilotSlides.md Section 13 for full specs of each archetype.
 */
export type DesignArchetype =
  | "THE_HERO"        // one dominant element, 50–70% of slide, aggressive whitespace
  | "THE_TENSION"     // two opposing elements in visual conflict — left vs right, big vs small
  | "THE_BREATH"      // max 2 elements, rest is space — signals weight and importance
  | "THE_EDITORIAL"   // magazine-style, image bleeds edges, text overlaps, asymmetric
  | "THE_TYPOGRAPHIC" // type IS the design — weight/color/size contrast, no images needed
  | "THE_DATA_HERO"   // one number owns the slide at 100pt+, everything else 8–10x smaller
  | "THE_LAYER"       // 3 depth layers: atmosphere shape → image/block → text content
  | "THE_GRID";       // systematic equal units — features, teams, steps, comparisons

/** The visual personality of the entire deck.
 *  Chosen once at deck start (based on topic + audience + theme).
 *  All slides share the same voice — it's the through-line.
 */
export type DesignVoice =
  | "editorial"   // magazine-style, unexpected placement, type-forward
  | "bold"        // high contrast, huge type, minimal — tech/startup feel
  | "cinematic"   // dark bgs, dramatic lighting shapes, film-like
  | "clean"       // Swiss design, grid-based, confident whitespace
  | "organic"     // warm tones, soft shapes, human feel — brand/culture decks
  | "data"        // numbers as heroes, systematic grids, chart-first
  | "luxury"      // extreme whitespace, thin typography, single accent per slide
  | "formal";     // only when explicitly requested — classic hierarchy, conservative

// ---------------------------------------------------------------------------
// Slide Layout
// ---------------------------------------------------------------------------

export type LayoutType =
  | "free"       // AI places everything manually — full positional control
  | "hero"       // full-bleed image/bg, centered or anchored text
  | "split"      // left text / right visual (or reverse)
  | "columns"    // 2 or 3 equal columns
  | "timeline"   // horizontal or vertical steps
  | "title"      // title + subtitle, minimal
  | "blank";     // no predefined structure

// ---------------------------------------------------------------------------
// Slide Spec — the core data unit
// ---------------------------------------------------------------------------

export type SlideSpec = {
  id: string;            // e.g. "slide_001"
  position: number;      // order in deck (1-indexed)
  layout: LayoutType;
  archetype: DesignArchetype;
  designIntent: string;  // AI's stated goal: "make viewer feel X" — logged for debugging
  background: Background;
  elements: SlideElement[];
  transition?: TransitionSpec;
  speakerNotes?: string;
};

// ---------------------------------------------------------------------------
// Color Theme
// ---------------------------------------------------------------------------

export type FontChoice = {
  web: string;    // Google Font name (web renderer)
  pptx: string;   // System font fallback (PPTX export — see FontMap)
  weight: number; // default weight for this role
};

/** Named color palette with semantic roles.
 *  AI references tokens (e.g. theme.palette.primary), never raw hex.
 *  Swapping the theme recolors the entire deck instantly.
 */
export type DeckTheme = {
  name: string;           // e.g. "rose + cream + black"
  palette: {
    background: string;   // main slide background
    surface: string;      // card / panel / callout background
    primary: string;      // main accent — shapes, highlights, CTAs (use sparingly)
    secondary: string;    // supporting accent — secondary elements
    text: string;         // primary text color
    textMuted: string;    // secondary / caption text
    border: string;       // subtle dividers and borders
  };
  typography: {
    heading: FontChoice;
    body: FontChoice;
  };
};

// ---------------------------------------------------------------------------
// Built-in Theme Library
// ---------------------------------------------------------------------------

export const BUILT_IN_THEMES: DeckTheme[] = [
  {
    name: "rose + cream + black",
    palette: { background: "#0a0a0a", surface: "#1a1410", primary: "#f43f5e", secondary: "#fef3c7", text: "#ffffff", textMuted: "#ffffff66", border: "#ffffff1a" },
    typography: { heading: { web: "Playfair Display", pptx: "Georgia", weight: 700 }, body: { web: "Inter", pptx: "Calibri", weight: 400 } },
  },
  {
    name: "matcha + cream + black",
    palette: { background: "#0a0a0a", surface: "#111a14", primary: "#6b8f5e", secondary: "#fef3c7", text: "#ffffff", textMuted: "#ffffff66", border: "#ffffff1a" },
    typography: { heading: { web: "Cormorant", pptx: "Garamond", weight: 600 }, body: { web: "Inter", pptx: "Calibri", weight: 400 } },
  },
  {
    name: "ocean + white + navy",
    palette: { background: "#0f2744", surface: "#1a3a5c", primary: "#0ea5e9", secondary: "#ffffff", text: "#ffffff", textMuted: "#ffffff80", border: "#ffffff20" },
    typography: { heading: { web: "Inter", pptx: "Calibri", weight: 700 }, body: { web: "Source Sans Pro", pptx: "Corbel", weight: 400 } },
  },
  {
    name: "ember + charcoal + black",
    palette: { background: "#0f0f0f", surface: "#1a1a1a", primary: "#f97316", secondary: "#d4d4d4", text: "#ffffff", textMuted: "#ffffff60", border: "#ffffff15" },
    typography: { heading: { web: "Inter", pptx: "Calibri", weight: 800 }, body: { web: "Inter", pptx: "Calibri", weight: 400 } },
  },
  {
    name: "forest + ivory + dark",
    palette: { background: "#111a14", surface: "#1a2a1e", primary: "#4a7c59", secondary: "#f5f0e8", text: "#f5f0e8", textMuted: "#f5f0e880", border: "#f5f0e81a" },
    typography: { heading: { web: "Cormorant", pptx: "Garamond", weight: 700 }, body: { web: "Nunito", pptx: "Trebuchet MS", weight: 400 } },
  },
  {
    name: "slate + gold + midnight",
    palette: { background: "#0f172a", surface: "#1e293b", primary: "#f59e0b", secondary: "#94a3b8", text: "#f8fafc", textMuted: "#94a3b8", border: "#334155" },
    typography: { heading: { web: "Playfair Display", pptx: "Georgia", weight: 700 }, body: { web: "Source Sans Pro", pptx: "Corbel", weight: 400 } },
  },
  {
    name: "lavender + white + violet",
    palette: { background: "#1e1b4b", surface: "#2e2a6b", primary: "#a78bfa", secondary: "#ffffff", text: "#ffffff", textMuted: "#ffffff70", border: "#ffffff20" },
    typography: { heading: { web: "Nunito", pptx: "Trebuchet MS", weight: 700 }, body: { web: "Inter", pptx: "Calibri", weight: 400 } },
  },
  {
    name: "arctic + silver + midnight",
    palette: { background: "#0a0f1e", surface: "#111827", primary: "#38bdf8", secondary: "#e2e8f0", text: "#f1f5f9", textMuted: "#94a3b8", border: "#1e293b" },
    typography: { heading: { web: "Inter", pptx: "Calibri", weight: 700 }, body: { web: "Inter", pptx: "Calibri", weight: 400 } },
  },
  {
    name: "crimson + bone + black",
    palette: { background: "#0c0a09", surface: "#1c1917", primary: "#dc2626", secondary: "#fafaf9", text: "#fafaf9", textMuted: "#a8a29e", border: "#292524" },
    typography: { heading: { web: "Playfair Display", pptx: "Georgia", weight: 800 }, body: { web: "Source Sans Pro", pptx: "Corbel", weight: 400 } },
  },
  {
    name: "sage + linen + walnut",
    palette: { background: "#2d2a24", surface: "#3d3a32", primary: "#84a98c", secondary: "#f8f4ee", text: "#f8f4ee", textMuted: "#f8f4ee70", border: "#f8f4ee15" },
    typography: { heading: { web: "Cormorant", pptx: "Garamond", weight: 600 }, body: { web: "Nunito", pptx: "Trebuchet MS", weight: 400 } },
  },
];

export const THEME_NAMES = BUILT_IN_THEMES.map((t) => t.name);

export function getThemeByName(name: string): DeckTheme | undefined {
  return BUILT_IN_THEMES.find((t) => t.name === name);
}

const FALLBACK_THEME: DeckTheme = BUILT_IN_THEMES[3]; // ember + charcoal + black

/** Coerce any LLM-produced theme-ish object into a fully-formed DeckTheme.
 *  - Strings resolve via getThemeByName and fall back to base.
 *  - Partial objects are deep-merged with `base` (or FALLBACK_THEME) so
 *    consumers can always read theme.palette.* / theme.typography.*.
 */
export function normalizeDeckTheme(
  input: unknown,
  base: DeckTheme = FALLBACK_THEME,
): DeckTheme {
  if (typeof input === "string") {
    return getThemeByName(input) ?? base;
  }
  if (!input || typeof input !== "object") return base;
  const t = input as Partial<DeckTheme> & { palette?: Partial<DeckTheme["palette"]>; typography?: Partial<DeckTheme["typography"]> };
  return {
    name: typeof t.name === "string" && t.name.trim() ? t.name : base.name,
    palette: { ...base.palette, ...(t.palette ?? {}) },
    typography: {
      heading: { ...base.typography.heading, ...(t.typography?.heading ?? {}) },
      body: { ...base.typography.body, ...(t.typography?.body ?? {}) },
    },
  };
}

// ---------------------------------------------------------------------------
// Font Map — Google Font → PPTX system font substitution
// ---------------------------------------------------------------------------

export const FONT_MAP: Record<string, string> = {
  "Inter":              "Calibri",
  "Source Sans Pro":    "Corbel",
  "Playfair Display":   "Georgia",
  "JetBrains Mono":     "Courier New",
  "Cormorant":          "Garamond",
  "Nunito":             "Trebuchet MS",
};

export function toPptxFont(webFont: string): string {
  return FONT_MAP[webFont] ?? "Calibri";
}

// ---------------------------------------------------------------------------
// Agent / Server State
// ---------------------------------------------------------------------------

export type AgentQuestion = {
  field: string;           // e.g. "deckTheme", "slideCount", "companyName"
  question: string;        // displayed to user in chat
  inputType: "text" | "choice" | "number";
  suggestions?: string[];  // for inputType: "choice"
};

export type SourceItem = {
  title: string;
  url: string;
  snippet?: string;
};

export type ExportDeckSnapshot = {
  deckId: string;
  slideCount: number;
  exportedAt: number;
};

export type DeckStatus =
  | "idle"
  | "running"
  | "waiting_for_user"
  | "complete"
  | "error";

export type DeckState = {
  deckId: string;
  runId: string;
  userId: string;
  status: DeckStatus;
  designVoice?: DesignVoice;
  theme?: DeckTheme;
  slides: SlideSpec[];
  sources: SourceItem[];
  pendingQuestion: AgentQuestion | null;
  exportSnapshot: ExportDeckSnapshot | null;
  errorMessage?: string;
  createdAt: number;
  updatedAt: number;
};

// ---------------------------------------------------------------------------
// SSE Events — streamed from server to frontend
// ---------------------------------------------------------------------------

export type SlidesSSEEvent =
  | { type: "workflow_step";     stepId: string; status: "pending" | "running" | "done" | "error"; detail?: string }
  | { type: "slide_created";     id: string; position: number }
  | { type: "slide_written";     id: string; title: string; bullets: string[]; speakerNotes?: string }
  | { type: "slide_designed";    id: string; spec: SlideSpec }
  | { type: "element_updated";   slideId: string; elementId: string; changes: Partial<TextStyle | ShapeStyle | ImageStyle | IconStyle> }
  | { type: "source_found";      title: string; url: string; snippet?: string }
  | { type: "ask_user";          question: AgentQuestion }
  | { type: "theme_set";         theme: DeckTheme }
  | { type: "voice_set";         voice: DesignVoice }
  | { type: "workflow_complete"; deckId: string }
  | { type: "error";             message: string };

// ---------------------------------------------------------------------------
// Edit Helpers
// ---------------------------------------------------------------------------

/** Universal patch function — used by BOTH user property panel and AI update_element tool.
 *  Single code path for all element edits guarantees consistency.
 */
export function applyElementPatch(
  state: DeckState,
  slideId: string,
  elementId: string,
  changes: Partial<TextStyle | ShapeStyle | ImageStyle | IconStyle>
): DeckState {
  return {
    ...state,
    updatedAt: Date.now(),
    slides: state.slides.map((slide) =>
      slide.id !== slideId
        ? slide
        : {
            ...slide,
            elements: slide.elements.map((el) =>
              el.id !== elementId
                ? el
                : ({ ...el, style: { ...el.style, ...changes } } as SlideElement)
            ),
          }
    ),
  };
}

/** Replace or insert a full SlideSpec in DeckState. */
export function applySlideUpsert(state: DeckState, spec: SlideSpec): DeckState {
  const exists = state.slides.some((s) => s.id === spec.id);
  return {
    ...state,
    updatedAt: Date.now(),
    slides: exists
      ? state.slides.map((s) => (s.id === spec.id ? spec : s))
      : [...state.slides, spec].sort((a, b) => a.position - b.position),
  };
}

/** Remove an element from a slide. */
export function applyElementRemove(
  state: DeckState,
  slideId: string,
  elementId: string
): DeckState {
  return {
    ...state,
    updatedAt: Date.now(),
    slides: state.slides.map((slide) =>
      slide.id !== slideId
        ? slide
        : { ...slide, elements: slide.elements.filter((el) => el.id !== elementId) }
    ),
  };
}

/** Add an element to a slide. */
export function applyElementAdd(
  state: DeckState,
  slideId: string,
  element: SlideElement
): DeckState {
  return {
    ...state,
    updatedAt: Date.now(),
    slides: state.slides.map((slide) =>
      slide.id !== slideId
        ? slide
        : { ...slide, elements: [...slide.elements, element] }
    ),
  };
}

// ---------------------------------------------------------------------------
// Slide / Element Normalization (for LLM and external inputs)
// ---------------------------------------------------------------------------
// LLMs frequently produce partial elements (missing `style`, malformed
// `position`, etc.). These helpers fill in safe defaults so the renderer
// never crashes on `el.style.fontFamily` and similar reads.

const ALLOWED_TEXT_VARIANTS = new Set<TextVariant>([
  "title", "subtitle", "body", "caption", "quote", "label", "stat",
]);
const ALLOWED_SHAPES = new Set<ShapeType>([
  "rectangle", "circle", "oval", "triangle", "arrow",
  "diamond", "hexagon", "parallelogram", "speechBubble", "star", "line",
]);
const ALLOWED_IMG_FITS = new Set<ImageStyle["objectFit"]>(["cover", "contain", "fill"]);
const ALLOWED_ALIGN = new Set<TextStyle["align"]>(["left", "center", "right", "justify"]);
const ALLOWED_WEIGHTS = new Set([100, 200, 300, 400, 500, 600, 700, 800, 900]);

function clampNum(n: unknown, min: number, max: number, fallback: number): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, v));
}

function safeStr(v: unknown, fallback: string): string {
  return typeof v === "string" && v.length > 0 ? v : fallback;
}

function safeRect(input: unknown, fallback: Rect = { x: 8, y: 8, w: 40, h: 20 }): Rect {
  const r = (input ?? {}) as Partial<Rect>;
  return {
    x: clampNum(r.x, -100, 200, fallback.x),
    y: clampNum(r.y, -100, 200, fallback.y),
    w: clampNum(r.w, 0.1, 200, fallback.w),
    h: clampNum(r.h, 0.1, 200, fallback.h),
  };
}

function normalizeWeight(input: unknown, fallback: TextStyle["fontWeight"] = 400): TextStyle["fontWeight"] {
  const n = typeof input === "number" ? input : Number(input);
  if (Number.isFinite(n) && ALLOWED_WEIGHTS.has(n)) return n as TextStyle["fontWeight"];
  return fallback;
}

function normalizeTextStyle(input: unknown, theme?: DeckTheme | null): TextStyle {
  const s = (input ?? {}) as Partial<TextStyle>;
  return {
    fontSize: clampNum(s.fontSize, 4, 600, 24),
    fontWeight: normalizeWeight(s.fontWeight, 400),
    fontFamily: safeStr(s.fontFamily, theme?.typography?.body?.web ?? "Inter"),
    color: safeStr(s.color, theme?.palette?.text ?? "#ffffff"),
    align: ALLOWED_ALIGN.has(s.align as TextStyle["align"]) ? (s.align as TextStyle["align"]) : "left",
    italic: s.italic === true,
    underline: s.underline === true,
    strikethrough: s.strikethrough === true,
    lineHeight: typeof s.lineHeight === "number" ? clampNum(s.lineHeight, 0.5, 4, 1.3) : 1.3,
    letterSpacing: typeof s.letterSpacing === "number" ? clampNum(s.letterSpacing, -0.5, 1, 0) : undefined,
    opacity: typeof s.opacity === "number" ? clampNum(s.opacity, 0, 1, 1) : 1,
  };
}

function normalizeShapeStyle(input: unknown, theme?: DeckTheme | null): ShapeStyle {
  const s = (input ?? {}) as Partial<ShapeStyle>;
  return {
    fill: safeStr(s.fill, theme?.palette?.primary ?? "#3b82f6"),
    stroke: typeof s.stroke === "string" ? s.stroke : undefined,
    strokeWidth: typeof s.strokeWidth === "number" ? clampNum(s.strokeWidth, 0, 64, 0) : undefined,
    opacity: typeof s.opacity === "number" ? clampNum(s.opacity, 0, 1, 1) : 1,
    cornerRadius: typeof s.cornerRadius === "number" ? clampNum(s.cornerRadius, 0, 256, 0) : undefined,
    rotation: typeof s.rotation === "number" ? s.rotation : undefined,
  };
}

function normalizeImageStyle(input: unknown): ImageStyle {
  const s = (input ?? {}) as Partial<ImageStyle>;
  return {
    objectFit: ALLOWED_IMG_FITS.has(s.objectFit as ImageStyle["objectFit"])
      ? (s.objectFit as ImageStyle["objectFit"])
      : "cover",
    borderRadius: typeof s.borderRadius === "number" ? clampNum(s.borderRadius, 0, 1024, 0) : undefined,
    opacity: typeof s.opacity === "number" ? clampNum(s.opacity, 0, 1, 1) : 1,
    rotation: typeof s.rotation === "number" ? s.rotation : undefined,
  };
}

function normalizeIconStyle(input: unknown, theme?: DeckTheme | null): IconStyle {
  const s = (input ?? {}) as Partial<IconStyle>;
  return {
    color: safeStr(s.color, theme?.palette?.primary ?? "#ffffff"),
    size: clampNum(s.size, 4, 256, 24),
    opacity: typeof s.opacity === "number" ? clampNum(s.opacity, 0, 1, 1) : 1,
  };
}

let _autoElId = 0;
function autoElId(slidePrefix: string, kind: string): string {
  _autoElId += 1;
  return `${slidePrefix || "el"}_${kind}_${_autoElId}`;
}

/** Coerce arbitrary LLM-shaped element JSON into a valid SlideElement, or null
 *  if the type is unrecognizable. Always returns a complete `style`. */
export function normalizeSlideElement(
  input: unknown,
  opts?: { theme?: DeckTheme | null; idPrefix?: string },
): SlideElement | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const theme = opts?.theme ?? null;
  const prefix = opts?.idPrefix ?? "el";

  const type = raw.type;
  const position = safeRect(raw.position);
  const animation = (raw.animation ?? undefined) as AnimationSpec | undefined;

  if (type === "text") {
    const variant = ALLOWED_TEXT_VARIANTS.has(raw.variant as TextVariant)
      ? (raw.variant as TextVariant)
      : "body";
    return {
      id: safeStr(raw.id, autoElId(prefix, "text")),
      type: "text",
      variant,
      content: safeStr(raw.content, ""),
      position,
      style: normalizeTextStyle(raw.style, theme),
      animation,
    };
  }
  if (type === "shape") {
    const shape = ALLOWED_SHAPES.has(raw.shape as ShapeType)
      ? (raw.shape as ShapeType)
      : "rectangle";
    return {
      id: safeStr(raw.id, autoElId(prefix, "shape")),
      type: "shape",
      shape,
      position,
      style: normalizeShapeStyle(raw.style, theme),
      animation,
    };
  }
  if (type === "image") {
    return {
      id: safeStr(raw.id, autoElId(prefix, "image")),
      type: "image",
      src: safeStr(raw.src, ""),
      sourceType: (typeof raw.sourceType === "string" ? raw.sourceType : "url") as ImageSourceType,
      position,
      style: normalizeImageStyle(raw.style),
      animation,
    };
  }
  if (type === "icon") {
    return {
      id: safeStr(raw.id, autoElId(prefix, "icon")),
      type: "icon",
      name: safeStr(raw.name, "Square"),
      position,
      style: normalizeIconStyle(raw.style, theme),
      animation,
    };
  }
  return null;
}

/** Coerce a list of LLM elements, skipping ones that can't be normalized. */
export function normalizeSlideElements(
  input: unknown,
  opts?: { theme?: DeckTheme | null; idPrefix?: string },
): SlideElement[] {
  if (!Array.isArray(input)) return [];
  const out: SlideElement[] = [];
  for (const raw of input) {
    const el = normalizeSlideElement(raw, opts);
    if (el) out.push(el);
  }
  return out;
}

/** Coerce arbitrary LLM-shaped slide JSON into a valid SlideSpec. */
export function normalizeSlideSpec(
  input: unknown,
  fallback: { id: string; position: number },
  opts?: { theme?: DeckTheme | null },
): SlideSpec {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const theme = opts?.theme ?? null;
  const id = safeStr(raw.id, fallback.id);
  const position = typeof raw.position === "number" ? raw.position : fallback.position;
  const elements = normalizeSlideElements(raw.elements, { theme, idPrefix: id });
  const background: Background =
    (raw.background as Background | undefined) ?? {
      type: "solid",
      color: theme?.palette?.background ?? "#0a0f1e",
    };
  return {
    id,
    position,
    layout: (raw.layout as SlideSpec["layout"]) ?? "free",
    archetype: (raw.archetype as SlideSpec["archetype"]) ?? "THE_HERO",
    designIntent: typeof raw.designIntent === "string" ? raw.designIntent : "Designed slide.",
    background,
    elements,
    transition: raw.transition as TransitionSpec | undefined,
    speakerNotes: typeof raw.speakerNotes === "string" ? raw.speakerNotes : undefined,
  };
}
