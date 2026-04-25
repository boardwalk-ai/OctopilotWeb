import type { DeckTheme, SlideSpec } from "@/types/slides";

const IGNORE = new Set(["system-ui", "sans-serif", "serif", "monospace", "inherit", "initial"]);
const ALLOWED_WEIGHTS = new Set([100, 200, 300, 400, 500, 600, 700, 800, 900]);
// Google Fonts family names: letters, digits, spaces, hyphens, ampersands.
const VALID_FAMILY_RE = /^[A-Za-z0-9 \-&]+$/;

function sanitizeFamily(input: unknown): string | null {
  if (typeof input !== "string") return null;
  // If the user passed a CSS stack like "Inter, sans-serif", take the first family.
  const first = input.split(",")[0]?.trim().replace(/^["']|["']$/g, "");
  if (!first) return null;
  if (IGNORE.has(first.toLowerCase())) return null;
  if (!VALID_FAMILY_RE.test(first)) return null;
  return first;
}

function sanitizeWeight(input: unknown): number {
  const n = typeof input === "number" ? input : Number(input);
  if (Number.isFinite(n) && ALLOWED_WEIGHTS.has(n)) return n;
  return 400;
}

export function collectSlideFontWeights(
  theme: DeckTheme | null | undefined,
  slides: SlideSpec[],
): Map<string, Set<number>> {
  const map = new Map<string, Set<number>>();
  const add = (familyRaw: unknown, weightRaw: unknown) => {
    const family = sanitizeFamily(familyRaw);
    if (!family) return;
    const weight = sanitizeWeight(weightRaw);
    if (!map.has(family)) map.set(family, new Set());
    map.get(family)!.add(weight);
  };

  const heading = theme?.typography?.heading;
  const body = theme?.typography?.body;
  if (heading) add(heading.web, heading.weight);
  if (body) add(body.web, body.weight);

  for (const slide of slides) {
    if (!slide || !Array.isArray(slide.elements)) continue;
    for (const el of slide.elements) {
      if (el?.type === "text") {
        const s = el.style ?? null;
        add(s?.fontFamily, s?.fontWeight);
      }
    }
  }
  return map;
}

/** Google Fonts CSS2 URL for all theme + slide text families (weights union). */
export function buildGoogleFontsCssHref(
  theme: DeckTheme | null | undefined,
  slides: SlideSpec[],
): string | null {
  const map = collectSlideFontWeights(theme, slides);
  if (map.size === 0) return null;

  const parts: string[] = [];
  for (const [family, weights] of map) {
    const enc = family.replace(/ /g, "+");
    const w = [...weights].sort((a, b) => a - b).join(";");
    parts.push(`family=${enc}:wght@${w}`);
  }
  return `https://fonts.googleapis.com/css2?${parts.join("&")}&display=swap`;
}
