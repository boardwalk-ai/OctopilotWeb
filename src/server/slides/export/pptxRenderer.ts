import PptxGenJS from "pptxgenjs";
import { Buffer } from "node:buffer";
import sharp from "sharp";
import { PNG } from "pngjs";
import { injectPptxSlideTransitions } from "@/server/slides/export/injectPptxSlideTransitions";
import type {
  Background,
  DeckTheme,
  SlideElement,
  SlideSpec,
  TextElement,
  ShapeElement,
  ImageElement,
  IconElement,
} from "@/types/slides";
import { toPptxFont } from "@/types/slides";

// 16:9 widescreen in PPTX inches (default in PowerPoint)
const SLIDE_W_IN = 10;
const SLIDE_H_IN = 5.625;

/** Raster size for gradient → PNG backgrounds (16:9, enough for crisp projection). */
const GRADIENT_PNG_W = 1920;
const GRADIENT_PNG_H = 1080;

/** Pinned lucide-static icons on jsDelivr (SVG → PNG via sharp). */
const LUCIDE_STATIC_VER = "0.469.0";

function iconNameToKebab(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}

function pctX(x: number): number {
  return (x / 100) * SLIDE_W_IN;
}
function pctY(y: number): number {
  return (y / 100) * SLIDE_H_IN;
}
function pctW(w: number): number {
  return (w / 100) * SLIDE_W_IN;
}
function pctH(h: number): number {
  return (h / 100) * SLIDE_H_IN;
}

function hexNoHash(color: string): string {
  return (color || "").replace("#", "").trim();
}

function safeOpacity(opacity?: number): number | undefined {
  if (opacity == null) return undefined;
  const v = Math.max(0, Math.min(1, opacity));
  // pptxgen expects 0..1 for transparency? It uses `transparency` (0..100).
  // We convert in callers that support it.
  return v;
}

function textAlign(align: TextElement["style"]["align"]) {
  if (align === "left") return "left";
  if (align === "center") return "center";
  if (align === "right") return "right";
  if (align === "justify") return "justify";
  return "left";
}

function parseHexRgb(hex: string): { r: number; g: number; b: number } {
  const h = hexNoHash(hex);
  if (h.length === 3) {
    return {
      r: parseInt(h[0] + h[0], 16),
      g: parseInt(h[1] + h[1], 16),
      b: parseInt(h[2] + h[2], 16),
    };
  }
  if (h.length === 6) {
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }
  return { r: 0, g: 0, b: 0 };
}

/**
 * CSS `linear-gradient(angle, from, to)`–aligned raster (angle in deg, 0 = up, 90 = right).
 * PptxGenJS does not emit OOXML gradFill for slide backgrounds; we match the web renderer via PNG.
 */
function linearGradientToPngBuffer(
  width: number,
  height: number,
  fromHex: string,
  toHex: string,
  angleDeg: number,
): Buffer {
  const from = parseHexRgb(fromHex);
  const to = parseHexRgb(toHex);
  const rad = (angleDeg * Math.PI) / 180;
  const gx = Math.sin(rad);
  const gy = -Math.cos(rad);

  const corners: [number, number][] = [
    [0, 0],
    [width, 0],
    [0, height],
    [width, height],
  ];
  let minO = Infinity;
  let maxO = -Infinity;
  for (const [x, y] of corners) {
    const o = x * gx + y * gy;
    minO = Math.min(minO, o);
    maxO = Math.max(maxO, o);
  }
  const span = maxO - minO || 1;

  const png = new PNG({ width, height, colorType: 6 });
  const { data } = png;
  let i = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = clamp01((x * gx + y * gy - minO) / span);
      data[i++] = Math.round(from.r + (to.r - from.r) * t);
      data[i++] = Math.round(from.g + (to.g - from.g) * t);
      data[i++] = Math.round(from.b + (to.b - from.b) * t);
      data[i++] = 255;
    }
  }
  return PNG.sync.write(png);
}

function gradientBackgroundToDataUrl(bg: Extract<Background, { type: "gradient" }>): string {
  const buf = linearGradientToPngBuffer(
    GRADIENT_PNG_W,
    GRADIENT_PNG_H,
    bg.from,
    bg.to,
    bg.angle,
  );
  return `data:image/png;base64,${buf.toString("base64")}`;
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

async function applySlideBackground(slide: any, bg: Background) {
  if (bg.type === "solid") {
    slide.background = { color: hexNoHash(bg.color) };
    return;
  }

  if (bg.type === "gradient") {
    slide.addImage({
      data: gradientBackgroundToDataUrl(bg),
      x: 0,
      y: 0,
      w: SLIDE_W_IN,
      h: SLIDE_H_IN,
    });
    return;
  }

  if (bg.type === "image") {
    // Base layer: full-bleed image.
    const img = await fetchImageData(bg.src);
    slide.addImage({
      data: img.data,
      x: 0,
      y: 0,
      w: SLIDE_W_IN,
      h: SLIDE_H_IN,
    });

    // Optional overlay to ensure legibility (e.g. darken).
    if (bg.overlay) {
      const opacity = bg.overlayOpacity == null ? 0.6 : clamp01(bg.overlayOpacity);
      slide.addShape("rect", {
        x: 0,
        y: 0,
        w: SLIDE_W_IN,
        h: SLIDE_H_IN,
        fill: {
          color: hexNoHash(bg.overlay),
          transparency: Math.round((1 - opacity) * 100),
        },
        line: { color: "000000", transparency: 100 },
      });
    }
  }
}

function mapShapeType(shape: ShapeElement["shape"]): string {
  // PptxGenJS shape names vary; keep to the common ones.
  switch (shape) {
    case "rectangle":
      return "rect";
    case "circle":
    case "oval":
      return "ellipse";
    case "triangle":
      return "triangle";
    case "diamond":
      return "diamond";
    case "hexagon":
      return "hexagon";
    case "parallelogram":
      return "parallelogram";
    case "arrow":
      return "rightArrow";
    case "star":
      return "star5";
    case "speechBubble":
      return "wedgeRoundRectCallout";
    case "line":
      return "line";
    default:
      return "rect";
  }
}

async function fetchImageData(url: string): Promise<{ data: string; ext: "png" | "jpg" }> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }
  const contentType = response.headers.get("content-type") || "";
  const bytes = new Uint8Array(await response.arrayBuffer());
  const base64 = Buffer.from(bytes).toString("base64");

  const ext: "png" | "jpg" =
    contentType.includes("png") || url.toLowerCase().endsWith(".png") ? "png" : "jpg";
  const mime = ext === "png" ? "image/png" : "image/jpeg";
  return { data: `data:${mime};base64,${base64}`, ext };
}

function addText(slide: any, el: TextElement, theme?: DeckTheme) {
  slide.addText(el.content ?? "", {
    x: pctX(el.position.x),
    y: pctY(el.position.y),
    w: pctW(el.position.w),
    h: pctH(el.position.h),
    fontFace: toPptxFont(el.style.fontFamily || theme?.typography.body.web || "Inter"),
    fontSize: el.style.fontSize,
    bold: el.style.fontWeight >= 700,
    italic: !!el.style.italic,
    underline: !!el.style.underline,
    strike: !!el.style.strikethrough,
    color: hexNoHash(el.style.color || theme?.palette.text || "#ffffff"),
    align: textAlign(el.style.align),
    // PptxGenJS uses `transparency` 0..100 (100=fully transparent)
    transparency:
      el.style.opacity == null ? undefined : Math.round((1 - safeOpacity(el.style.opacity)!) * 100),
    lineSpacingMultiple: el.style.lineHeight,
    charSpacing:
      el.style.letterSpacing == null
        ? undefined
        : Math.round(el.style.fontSize * el.style.letterSpacing * 25),
  });
}

function addShape(slide: any, el: ShapeElement) {
  const s = el.style;
  const shapeType = mapShapeType(el.shape);

  if (shapeType === "line") {
    slide.addShape(shapeType, {
      x: pctX(el.position.x),
      y: pctY(el.position.y),
      w: pctW(el.position.w),
      h: pctH(el.position.h),
      line: {
        color: hexNoHash(s.stroke ?? (s.fill === "transparent" ? "#ffffff" : s.fill)),
        width: s.strokeWidth ?? 2,
        transparency:
          s.opacity == null ? undefined : Math.round((1 - safeOpacity(s.opacity)!) * 100),
      },
      rotate: s.rotation ?? 0,
    });
    return;
  }

  slide.addShape(shapeType, {
    x: pctX(el.position.x),
    y: pctY(el.position.y),
    w: pctW(el.position.w),
    h: pctH(el.position.h),
    fill: {
      color: s.fill === "transparent" ? "FFFFFF" : hexNoHash(s.fill),
      transparency:
        s.fill === "transparent"
          ? 100
          : s.opacity == null
            ? undefined
            : Math.round((1 - safeOpacity(s.opacity)!) * 100),
    },
    line: s.stroke
      ? {
          color: hexNoHash(s.stroke),
          width: s.strokeWidth ?? 1,
        }
      : undefined,
    rotate: s.rotation ?? 0,
    // Best-effort rounded rect
    radius: s.cornerRadius ?? 0,
  });
}

async function addImage(slide: any, el: ImageElement) {
  const img = await fetchImageData(el.src);
  slide.addImage({
    data: img.data,
    x: pctX(el.position.x),
    y: pctY(el.position.y),
    w: pctW(el.position.w),
    h: pctH(el.position.h),
    transparency:
      el.style.opacity == null ? undefined : Math.round((1 - safeOpacity(el.style.opacity)!) * 100),
    rotate: el.style.rotation ?? 0,
  });
}

async function lucideIconToPngDataUrl(name: string, colorHex: string, px: number): Promise<string | null> {
  const kebab = iconNameToKebab(name);
  const url = `https://cdn.jsdelivr.net/npm/lucide-static@${LUCIDE_STATIC_VER}/icons/${kebab}.svg`;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    let svg = await response.text();
    const hex = hexNoHash(colorHex || "ffffff");
    svg = svg.replace(/currentColor/g, `#${hex}`);
    const png = await sharp(Buffer.from(svg))
      .resize(Math.max(8, Math.round(px)), Math.max(8, Math.round(px)))
      .png()
      .toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}

async function addIcon(slide: any, el: IconElement) {
  const pt = Math.max(8, Math.min(200, el.style.size ?? 24));
  const px = Math.min(512, Math.max(32, Math.round(pt * 2.5)));
  const dataUrl = await lucideIconToPngDataUrl(el.name, el.style.color || "#ffffff", px);
  if (dataUrl) {
    slide.addImage({
      data: dataUrl,
      x: pctX(el.position.x),
      y: pctY(el.position.y),
      w: pctW(el.position.w),
      h: pctH(el.position.h),
      transparency:
        el.style.opacity == null ? undefined : Math.round((1 - safeOpacity(el.style.opacity)!) * 100),
    });
    return;
  }
  slide.addText("■", {
    x: pctX(el.position.x),
    y: pctY(el.position.y),
    w: pctW(el.position.w),
    h: pctH(el.position.h),
    fontFace: "Calibri",
    fontSize: pt,
    color: hexNoHash(el.style.color || "#ffffff"),
    align: "center",
    valign: "mid",
    transparency:
      el.style.opacity == null ? undefined : Math.round((1 - safeOpacity(el.style.opacity)!) * 100),
  });
}

export async function renderDeckToPptxBuffer(args: {
  slides: SlideSpec[];
  theme?: DeckTheme;
  deckTitle?: string;
}): Promise<Uint8Array> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "OctopilotSlides";
  if (args.deckTitle) pptx.subject = args.deckTitle;

  const ordered = [...args.slides].sort((a, b) => a.position - b.position);
  for (const spec of ordered) {
    const slide = pptx.addSlide();

    await applySlideBackground(slide, spec.background);

    for (const el of spec.elements as SlideElement[]) {
      if (el.type === "text") addText(slide, el as TextElement, args.theme);
      if (el.type === "shape") addShape(slide, el as ShapeElement);
      if (el.type === "image") await addImage(slide, el as ImageElement);
      if (el.type === "icon") await addIcon(slide, el as IconElement);
    }

    if (spec.speakerNotes) {
      slide.addNotes(spec.speakerNotes);
    }
  }

  // `pptxgenjs` write() API differs slightly across versions; we use the
  // object form here and cast to keep TS happy.
  const ab = (await (pptx as any).write({ outputType: "arraybuffer" })) as ArrayBuffer;
  const raw = new Uint8Array(ab);
  const withTransitions = await injectPptxSlideTransitions(raw, ordered);
  return new Uint8Array(withTransitions);
}

