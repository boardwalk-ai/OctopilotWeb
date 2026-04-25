import PptxGenJS from "pptxgenjs";
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

function backgroundToSlideFill(bg: Background): { color?: string } {
  if (bg.type === "solid") return { color: hexNoHash(bg.color) };
  // MVP: gradients + images are handled as best-effort (solid fallback)
  if (bg.type === "gradient") return { color: hexNoHash(bg.from) };
  if (bg.type === "image") return { color: "000000" };
  return { color: "000000" };
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

function addIcon(slide: any, el: IconElement) {
  // MVP: icons export as text glyph placeholder (Phase 2: inline SVG → image).
  slide.addText("■", {
    x: pctX(el.position.x),
    y: pctY(el.position.y),
    w: pctW(el.position.w),
    h: pctH(el.position.h),
    fontFace: "Calibri",
    fontSize: Math.max(8, Math.min(200, el.style.size ?? 24)),
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

    const bg = backgroundToSlideFill(spec.background);
    if (bg.color) {
      slide.background = { color: bg.color };
    }

    for (const el of spec.elements as SlideElement[]) {
      if (el.type === "text") addText(slide, el as TextElement, args.theme);
      if (el.type === "shape") addShape(slide, el as ShapeElement);
      if (el.type === "image") await addImage(slide, el as ImageElement);
      if (el.type === "icon") addIcon(slide, el as IconElement);
    }

    if (spec.speakerNotes) {
      slide.addNotes(spec.speakerNotes);
    }
  }

  // `pptxgenjs` write() API differs slightly across versions; we use the
  // object form here and cast to keep TS happy.
  const ab = (await (pptx as any).write({ outputType: "arraybuffer" })) as ArrayBuffer;
  return new Uint8Array(ab);
}

