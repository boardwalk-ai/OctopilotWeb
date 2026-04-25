import type { DeckTheme, SlideSpec } from "@/types/slides";

const IGNORE = new Set(["system-ui", "sans-serif", "serif", "monospace", "inherit", "initial"]);

export function collectSlideFontWeights(theme: DeckTheme, slides: SlideSpec[]): Map<string, Set<number>> {
  const map = new Map<string, Set<number>>();
  const add = (family: string | undefined, weight: number) => {
    if (!family) return;
    const key = family.trim();
    if (!key || IGNORE.has(key.toLowerCase())) return;
    if (!map.has(key)) map.set(key, new Set());
    map.get(key)!.add(weight);
  };

  add(theme.typography.heading.web, theme.typography.heading.weight);
  add(theme.typography.body.web, theme.typography.body.weight);

  for (const slide of slides) {
    for (const el of slide.elements) {
      if (el.type === "text") {
        add(el.style.fontFamily, el.style.fontWeight);
      }
    }
  }
  return map;
}

/** Google Fonts CSS2 URL for all theme + slide text families (weights union). */
export function buildGoogleFontsCssHref(theme: DeckTheme, slides: SlideSpec[]): string | null {
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
