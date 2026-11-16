/**
 * OctoSlides recipes: tested building blocks for build.js so the model spends
 * its effort on the design, not on re-deriving pptxgenjs plumbing.
 *
 *   const R = require("/opt/sandbox/lib/recipes.js");
 *
 * Image helpers return a pptxgenjs `data` string ("image/png;base64,...").
 * Layout recipes add shapes to a slide; every element they add gets an
 * objectName `${id}-...` so motion.json and click-to-edit can target it.
 * Colors: a 6-digit hex ("1F2328") or a pres.SchemeColor value (C.accent1).
 * Hex-only places (shadows, gradients, duotone) need hex.
 */
"use strict";
const sharp = require("sharp");

const toData = (buf, mime = "image/png") => `${mime};base64,${buf.toString("base64")}`;
const hex = (c) => String(c).replace(/^#/, "").slice(0, 6);

// ── image helpers ────────────────────────────────────────────────────────────

/** A react-icons icon as a PNG. name: "FaRocket", "MdInsights", "LuSparkles", or "pack/Name". */
async function icon(name, { color = "FFFFFF", size = 256 } = {}) {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  let pack;
  let comp = name;
  if (name.includes("/")) [pack, comp] = name.split("/");
  else pack = (name.match(/^[A-Z][a-z]+/) || ["Fa"])[0].toLowerCase();
  const mod = require(`react-icons/${pack}`);
  const Icon = mod[comp];
  if (!Icon) throw new Error(`icon ${name}: not found in react-icons/${pack}`);
  const svg = renderToStaticMarkup(React.createElement(Icon, { size, color: `#${hex(color)}` }));
  return toData(await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer());
}

/** Linear gradient PNG (pptxgenjs has no gradient fills). stops: hex colors, angle in degrees. */
async function gradient({ w = 13.333, h = 7.5, stops = ["111827", "374151"], angle = 135, px = 1600 } = {}) {
  const W = Math.round(px);
  const H = Math.round((px * h) / w);
  const rad = (angle * Math.PI) / 180;
  const x1 = 50 - Math.cos(rad) * 50, y1 = 50 - Math.sin(rad) * 50;
  const x2 = 50 + Math.cos(rad) * 50, y2 = 50 + Math.sin(rad) * 50;
  const stopXml = stops.map((c, i) => `<stop offset="${(i / Math.max(1, stops.length - 1)) * 100}%" stop-color="#${hex(c)}"/>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><linearGradient id="g" x1="${x1}%" y1="${y1}%" x2="${x2}%" y2="${y2}%">${stopXml}</linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`;
  return toData(await sharp(Buffer.from(svg)).png().toBuffer());
}

/** Soft radial glow / blob PNG for backgrounds (use with a transparency-free dark slide). */
async function glow({ color = "6366F1", size = 1200, strength = 0.55 } = {}) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><defs><radialGradient id="g"><stop offset="0%" stop-color="#${hex(color)}" stop-opacity="${strength}"/><stop offset="100%" stop-color="#${hex(color)}" stop-opacity="0"/></radialGradient></defs><circle cx="50%" cy="50%" r="50%" fill="url(#g)"/></svg>`;
  return toData(await sharp(Buffer.from(svg)).png().toBuffer());
}

/**
 * A photo cropped to w x h inches with an optional treatment:
 *   duotone: [darkHex, lightHex]   grayscale: true   blur: px
 *   overlay: { color: hex, opacity: 0..1 } or { gradient: [hex, hex], angle, opacity }
 *   radius: inches (rounded corners, PNG out)
 */
async function photo(path, { w, h, duotone, grayscale, blur, overlay, radius, px, position = "attention" } = {}) {
  if (!w || !h) throw new Error("photo(): w and h (inches) are required");
  // ~200 dpi at the placed size keeps decks small (rounded corners force PNG)
  const W = Math.round(px || Math.min(1800, Math.max(600, w * (radius ? 160 : 200))));
  const H = Math.round((W * h) / w);
  let img = sharp(path).rotate().resize(W, H, { fit: "cover", position });
  if (blur) img = img.blur(blur);
  if (grayscale || duotone) img = img.grayscale();
  let buf = await img.toBuffer();
  if (duotone) {
    const [d, l] = duotone.map(hex);
    const toRgb = (c) => [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16));
    const [dr, dg, db] = toRgb(d);
    const [lr, lg, lb] = toRgb(l);
    const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
    const out = Buffer.alloc(info.width * info.height * 3);
    for (let i = 0, j = 0; i < data.length; i += info.channels, j += 3) {
      const t = data[i] / 255;
      out[j] = dr + (lr - dr) * t;
      out[j + 1] = dg + (lg - dg) * t;
      out[j + 2] = db + (lb - db) * t;
    }
    buf = await sharp(out, { raw: { width: info.width, height: info.height, channels: 3 } }).png().toBuffer();
  }
  const layers = [];
  if (overlay) {
    const op = overlay.opacity ?? 0.5;
    let fill;
    let defs = "";
    if (overlay.gradient) {
      const rad = ((overlay.angle ?? 90) * Math.PI) / 180;
      defs = `<defs><linearGradient id="o" x1="${50 - Math.cos(rad) * 50}%" y1="${50 - Math.sin(rad) * 50}%" x2="${50 + Math.cos(rad) * 50}%" y2="${50 + Math.sin(rad) * 50}%"><stop offset="0%" stop-color="#${hex(overlay.gradient[0])}" stop-opacity="${op}"/><stop offset="100%" stop-color="#${hex(overlay.gradient[1])}" stop-opacity="${overlay.endOpacity ?? 0}"/></linearGradient></defs>`;
      fill = "url(#o)";
    } else fill = `#${hex(overlay.color || "000000")}" fill-opacity="${op}`;
    layers.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${defs}<rect width="100%" height="100%" fill="${fill}"/></svg>`) });
  }
  if (radius) {
    const r = Math.round((radius / w) * W);
    layers.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" rx="${r}" ry="${r}"/></svg>`), blend: "dest-in" });
  }
  let pipeline = sharp(buf).ensureAlpha();
  if (layers.length) pipeline = pipeline.composite(layers);
  const png = radius ? true : false;
  const outBuf = png ? await pipeline.png().toBuffer() : await pipeline.flatten().jpeg({ quality: 86 }).toBuffer();
  return toData(outBuf, png ? "image/png" : "image/jpeg");
}

// ── layout recipes ───────────────────────────────────────────────────────────
// All take (pres, slide, opts). Positions in inches. Fresh option objects every call.

/** Big-number callouts in a row: stats [{ value: "72%", label: "..." }]. */
function statRow(pres, slide, { id = "stat", x = 0.6, y = 2.2, w = 12.1, h = 2.6, stats = [], valueColor, labelColor, valueSize = 60, labelSize = 14, divider } = {}) {
  const n = Math.max(1, stats.length);
  const gap = 0.4;
  const cw = (w - gap * (n - 1)) / n;
  stats.forEach((s, i) => {
    const cx = x + i * (cw + gap);
    slide.addText(String(s.value), { x: cx, y, w: cw, h: h * 0.58, fontSize: valueSize, bold: true, color: valueColor, margin: 0, valign: "bottom", isTextBox: true, objectName: `${id}-${i + 1}-value` });
    slide.addText(String(s.label), { x: cx, y: y + h * 0.62, w: cw, h: h * 0.38, fontSize: labelSize, color: labelColor, margin: 0, valign: "top", isTextBox: true, objectName: `${id}-${i + 1}-label` });
    if (divider && i < n - 1) slide.addShape(pres.ShapeType.line, { x: cx + cw + gap / 2, y: y + 0.2, w: 0, h: h - 0.4, line: { color: divider, width: 1 }, objectName: `${id}-${i + 1}-divider` });
  });
}

/** Horizontal timeline: steps [{ label: "2021", title: "...", body: "..." }]. */
function timeline(pres, slide, { id = "tl", x = 0.6, y = 2.0, w = 12.1, h = 4.4, steps = [], lineColor, dotColor, labelColor, titleColor, bodyColor } = {}) {
  const n = Math.max(1, steps.length);
  const colW = w / n;
  const lineY = y + 0.9;
  slide.addShape(pres.ShapeType.line, { x, y: lineY, w, h: 0, line: { color: lineColor, width: 2 }, objectName: `${id}-line` });
  steps.forEach((s, i) => {
    const cx = x + i * colW;
    slide.addText(String(s.label ?? ""), { x: cx, y, w: colW - 0.2, h: 0.55, fontSize: 14, bold: true, color: labelColor, margin: 0, isTextBox: true, objectName: `${id}-${i + 1}-label` });
    slide.addShape(pres.ShapeType.ellipse, { x: cx, y: lineY - 0.11, w: 0.22, h: 0.22, fill: { color: dotColor }, line: { color: dotColor, width: 0 }, objectName: `${id}-${i + 1}-dot` });
    slide.addText(String(s.title ?? ""), { x: cx, y: lineY + 0.35, w: colW - 0.3, h: 0.7, fontSize: 18, bold: true, color: titleColor, margin: 0, valign: "top", isTextBox: true, objectName: `${id}-${i + 1}-title` });
    if (s.body) slide.addText(String(s.body), { x: cx, y: lineY + 1.1, w: colW - 0.3, h: h - 2.1, fontSize: 14, color: bodyColor, margin: 0, valign: "top", isTextBox: true, objectName: `${id}-${i + 1}-body` });
  });
}

/** Grid of cards: items [{ title, body, icon?: data string }]. Cards are tinted rounded rects (no edge stripes). */
function cardGrid(pres, slide, { id = "card", x = 0.6, y = 1.9, w = 12.1, h = 4.9, cols = 3, items = [], fill, titleColor, bodyColor, iconBg, radius = 0.12, gap = 0.35, shadowHex } = {}) {
  const rows = Math.ceil(items.length / cols);
  const cw = (w - gap * (cols - 1)) / cols;
  const ch = (h - gap * (rows - 1)) / rows;
  items.forEach((it, i) => {
    const cx = x + (i % cols) * (cw + gap);
    const cy = y + Math.floor(i / cols) * (ch + gap);
    slide.addShape(pres.ShapeType.roundRect, {
      x: cx, y: cy, w: cw, h: ch, rectRadius: radius, fill: { color: fill }, line: { color: fill, width: 0 },
      ...(shadowHex ? { shadow: { type: "outer", color: hex(shadowHex), blur: 12, offset: 3, angle: 90, opacity: 0.18 } } : {}),
      objectName: `${id}-${i + 1}-bg`,
    });
    let ty = cy + 0.35;
    if (it.icon) {
      slide.addShape(pres.ShapeType.ellipse, { x: cx + 0.35, y: ty, w: 0.62, h: 0.62, fill: { color: iconBg }, line: { color: iconBg, width: 0 }, objectName: `${id}-${i + 1}-iconbg` });
      slide.addImage({ data: it.icon, x: cx + 0.47, y: ty + 0.12, w: 0.38, h: 0.38, objectName: `${id}-${i + 1}-icon` });
      ty += 0.85;
    }
    slide.addText(String(it.title ?? ""), { x: cx + 0.35, y: ty, w: cw - 0.7, h: 0.5, fontSize: 18, bold: true, color: titleColor, margin: 0, valign: "top", isTextBox: true, objectName: `${id}-${i + 1}-title` });
    if (it.body) slide.addText(String(it.body), { x: cx + 0.35, y: ty + 0.55, w: cw - 0.7, h: Math.max(0.4, cy + ch - (ty + 0.55) - 0.3), fontSize: 14, color: bodyColor, margin: 0, valign: "top", isTextBox: true, objectName: `${id}-${i + 1}-body` });
  });
}

/** Large pull quote with attribution. */
function quote(pres, slide, { id = "quote", x = 1.2, y = 1.6, w = 10.9, h = 4.2, text = "", by = "", markColor, textColor, byColor, size = 32 } = {}) {
  slide.addText("“", { x: x - 0.2, y: y - 0.9, w: 1.5, h: 1.6, fontSize: 120, bold: true, color: markColor, margin: 0, isTextBox: true, objectName: `${id}-mark` });
  slide.addText(String(text), { x, y, w, h: h - 0.8, fontSize: size, italic: true, color: textColor, margin: 0, valign: "middle", isTextBox: true, objectName: `${id}-text` });
  if (by) slide.addText(`— ${by}`, { x, y: y + h - 0.7, w, h: 0.6, fontSize: 16, color: byColor, margin: 0, isTextBox: true, objectName: `${id}-by` });
}

/** Image on one half, content area on the other. Returns the content box { x, y, w, h }. */
function splitImage(pres, slide, { id = "split", image, side = "left", ratio = 0.45, slideW = 13.333, slideH = 7.5, pad = 0.6 } = {}) {
  const iw = slideW * ratio;
  const ix = side === "left" ? 0 : slideW - iw;
  slide.addImage({ data: image, x: ix, y: 0, w: iw, h: slideH, objectName: `${id}-image` });
  const cx = side === "left" ? iw + pad : pad;
  return { x: cx, y: pad, w: slideW - iw - pad * 2, h: slideH - pad * 2 };
}

module.exports = { icon, gradient, glow, photo, statRow, timeline, cardGrid, quote, splitImage };
