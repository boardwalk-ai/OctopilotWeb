#!/usr/bin/env node
/**
 * postbuild: runs after every build script (deck-run) and after a user's manual
 * edit (deck-post). Works on out/deck.pptx in place:
 *   1. edits.json  - the user's manual text edits (kept across rebuilds)
 *   2. motion.json - slide transitions (incl. Morph) and entrance animations
 *   3. writes out/layout.json - every element's box and text, for click-to-edit
 * Problems that are not fatal are printed as "warning: ..." lines on stderr.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");
const { DOMParser, XMLSerializer } = require("@xmldom/xmldom");

const WORK = process.cwd();
const DECK = path.join(WORK, "out", "deck.pptx");
const NS = {
  p: "http://schemas.openxmlformats.org/presentationml/2006/main",
  a: "http://schemas.openxmlformats.org/drawingml/2006/main",
  r: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
  rel: "http://schemas.openxmlformats.org/package/2006/relationships",
};
const warnings = [];
const warn = (msg) => warnings.push(msg);

function readJson(file) {
  const full = path.join(WORK, file);
  if (!fs.existsSync(full)) return null;
  try {
    return JSON.parse(fs.readFileSync(full, "utf8"));
  } catch (e) {
    warn(`${file} is not valid JSON (${e.message}); ignored`);
    return null;
  }
}

const parse = (xml) => new DOMParser().parseFromString(xml, "text/xml");
function serialize(doc) {
  const out = new XMLSerializer().serializeToString(doc);
  return out.startsWith("<?xml") ? out : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${out}`;
}
const kids = (node, ns, local) =>
  Array.from(node ? node.childNodes : []).filter((n) => n.nodeType === 1 && n.namespaceURI === ns && (!local || n.localName === local));
const kid = (node, ns, local) => kids(node, ns, local)[0] || null;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function resolveTarget(fromFile, target) {
  const parts = path.posix.dirname(fromFile).split("/");
  for (const seg of target.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

async function relsOf(zip, file) {
  const relFile = `${path.posix.dirname(file)}/_rels/${path.posix.basename(file)}.rels`;
  const entry = zip.file(relFile);
  if (!entry) return [];
  const doc = parse(await entry.async("string"));
  return Array.from(doc.getElementsByTagNameNS(NS.rel, "Relationship")).map((r) => ({
    id: r.getAttribute("Id"),
    type: r.getAttribute("Type") || "",
    target: resolveTarget(file, r.getAttribute("Target") || ""),
  }));
}

/** Slide part names in presentation order. */
async function slideFiles(zip) {
  const pres = parse(await zip.file("ppt/presentation.xml").async("string"));
  const rels = await relsOf(zip, "ppt/presentation.xml");
  const byId = new Map(rels.map((r) => [r.id, r.target]));
  const ids = Array.from(pres.getElementsByTagNameNS(NS.p, "sldId"));
  const sz = pres.getElementsByTagNameNS(NS.p, "sldSz")[0];
  return {
    files: ids.map((s) => byId.get(s.getAttributeNS(NS.r, "id"))).filter(Boolean),
    cx: Number(sz?.getAttribute("cx") || 12192000),
    cy: Number(sz?.getAttribute("cy") || 6858000),
  };
}

// ── element helpers ──────────────────────────────────────────────────────────
function cNvPr(el) {
  const nv = Array.from(el.childNodes).find((n) => n.nodeType === 1 && /^nv/.test(n.localName));
  return nv ? kid(nv, NS.p, "cNvPr") : null;
}
function phOf(el) {
  const nv = Array.from(el.childNodes).find((n) => n.nodeType === 1 && /^nv/.test(n.localName));
  const nvPr = nv ? kid(nv, NS.p, "nvPr") : null;
  const ph = nvPr ? kid(nvPr, NS.p, "ph") : null;
  return ph ? { type: ph.getAttribute("type") || "body", idx: ph.getAttribute("idx") || "" } : null;
}
function xfrmOf(el) {
  let x = null;
  if (el.localName === "graphicFrame") x = kid(el, NS.p, "xfrm");
  else if (el.localName === "grpSp") x = kid(kid(el, NS.p, "grpSpPr"), NS.a, "xfrm");
  else x = kid(kid(el, NS.p, "spPr"), NS.a, "xfrm");
  const off = x && kid(x, NS.a, "off");
  const ext = x && kid(x, NS.a, "ext");
  if (!off || !ext) return null;
  return { x: +off.getAttribute("x"), y: +off.getAttribute("y"), w: +ext.getAttribute("cx"), h: +ext.getAttribute("cy"), rot: +(x.getAttribute("rot") || 0) };
}
function editShape(el, edit, cx, cy) {
  const spPr = kid(el, NS.p, "spPr");
  const xfrm = el.localName === "graphicFrame" ? kid(el, NS.p, "xfrm") : kid(spPr, NS.a, "xfrm");
  if (!xfrm && !edit.format) return false;
  const off = kid(xfrm, NS.a, "off");
  const ext = kid(xfrm, NS.a, "ext");
  if ((!off || !ext) && !edit.format) return false;
  for (const [key, attr, parent, scale] of [["x", "x", off, cx], ["y", "y", off, cy], ["w", "cx", ext, cx], ["h", "cy", ext, cy]]) {
    if (parent && Number.isFinite(edit[key])) parent.setAttribute(attr, String(Math.round(edit[key] * scale)));
  }
  if (xfrm && Number.isFinite(edit.rot)) xfrm.setAttribute("rot", String(Math.round(edit.rot * 60000)));
  if (edit.fill && spPr) {
    for (const fill of kids(spPr, NS.a).filter((node) => ["solidFill", "gradFill", "pattFill", "blipFill", "noFill"].includes(node.localName))) spPr.removeChild(fill);
    const solid = el.ownerDocument.createElementNS(NS.a, "a:solidFill");
    const rgb = el.ownerDocument.createElementNS(NS.a, "a:srgbClr");
    rgb.setAttribute("val", edit.fill);
    solid.appendChild(rgb);
    const before = kids(spPr, NS.a).find((node) => ["ln", "effectLst", "effectDag", "scene3d", "sp3d"].includes(node.localName));
    spPr.insertBefore(solid, before || null);
  }
  if (edit.format) {
    const tx = kid(el, NS.p, "txBody");
    if (tx) for (const para of kids(tx, NS.a, "p")) {
      let pPr = kid(para, NS.a, "pPr");
      if (edit.format.align) {
        if (!pPr) { pPr = el.ownerDocument.createElementNS(NS.a, "a:pPr"); para.insertBefore(pPr, para.firstChild); }
        pPr.setAttribute("algn", { left: "l", center: "ctr", right: "r", justify: "just" }[edit.format.align] || "l");
      }
      for (const run of kids(para, NS.a, "r")) {
        let pr = kid(run, NS.a, "rPr");
        if (!pr) { pr = el.ownerDocument.createElementNS(NS.a, "a:rPr"); run.insertBefore(pr, run.firstChild); }
        if (typeof edit.format.bold === "boolean") pr.setAttribute("b", edit.format.bold ? "1" : "0");
        if (typeof edit.format.italic === "boolean") pr.setAttribute("i", edit.format.italic ? "1" : "0");
        if (typeof edit.format.underline === "boolean") pr.setAttribute("u", edit.format.underline ? "sng" : "none");
        if (edit.format.size) pr.setAttribute("sz", String(Math.round(edit.format.size * 100)));
        if (edit.format.font) {
          let latin = kid(pr, NS.a, "latin");
          if (!latin) { latin = el.ownerDocument.createElementNS(NS.a, "a:latin"); pr.appendChild(latin); }
          latin.setAttribute("typeface", edit.format.font);
        }
        if (edit.format.color) {
          for (const old of kids(pr, NS.a).filter((node) => ["solidFill", "gradFill", "pattFill", "blipFill", "noFill"].includes(node.localName))) pr.removeChild(old);
          const solid = el.ownerDocument.createElementNS(NS.a, "a:solidFill");
          const rgb = el.ownerDocument.createElementNS(NS.a, "a:srgbClr");
          rgb.setAttribute("val", edit.format.color);
          solid.appendChild(rgb);
          const before = kids(pr, NS.a).find((node) => ["latin", "ea", "cs", "sym", "hlinkClick", "hlinkMouseOver", "rtl"].includes(node.localName));
          pr.insertBefore(solid, before || null);
        }
      }
    }
  }
  return true;
}
function paragraphsOf(el) {
  const tx = kid(el, NS.p, "txBody");
  if (!tx) return null;
  return kids(tx, NS.a, "p").map((p) =>
    Array.from(p.getElementsByTagNameNS(NS.a, "t")).map((t) => t.textContent).join(""),
  );
}
function textFormatOf(el) {
  const tx = kid(el, NS.p, "txBody");
  const paragraph = kid(tx, NS.a, "p");
  if (!paragraph) return {};
  const pPr = kid(paragraph, NS.a, "pPr");
  const run = kid(paragraph, NS.a, "r");
  const pr = kid(run, NS.a, "rPr");
  const format = {};
  const alignment = { l: "left", ctr: "center", r: "right", just: "justify" }[pPr?.getAttribute("algn")];
  if (alignment) format.align = alignment;
  if (pr) {
    if (pr.hasAttribute("b")) format.bold = pr.getAttribute("b") === "1";
    if (pr.hasAttribute("i")) format.italic = pr.getAttribute("i") === "1";
    if (pr.hasAttribute("u")) format.underline = pr.getAttribute("u") !== "none";
    if (pr.hasAttribute("sz")) format.size = Number(pr.getAttribute("sz")) / 100;
    const latin = kid(pr, NS.a, "latin");
    if (latin?.getAttribute("typeface")) format.font = latin.getAttribute("typeface");
    const rgb = kid(kid(pr, NS.a, "solidFill"), NS.a, "srgbClr");
    if (rgb?.getAttribute("val")) format.color = rgb.getAttribute("val");
  }
  return format;
}
function topElements(spTree) {
  return Array.from(spTree.childNodes).filter(
    (n) => n.nodeType === 1 && n.namespaceURI === NS.p && ["sp", "pic", "graphicFrame", "grpSp", "cxnSp"].includes(n.localName),
  );
}
function addUserElement(doc, item, cx, cy) {
  if (findByName(doc, item.name).length) return false;
  const tree = spTreeOf(doc);
  const ids = Array.from(doc.getElementsByTagNameNS(NS.p, "cNvPr")).map((el) => Number(el.getAttribute("id")) || 0);
  const id = Math.max(1, ...ids) + 1;
  const x = Math.round(item.x * cx), y = Math.round(item.y * cy);
  const w = Math.round(item.w * cx), h = Math.round(item.h * cy);
  const fill = item.kind === "shape" ? `<a:solidFill><a:srgbClr val="${item.fill || "4472C4"}"/></a:solidFill>` : "<a:noFill/>";
  const text = item.kind === "text" ? `<a:r><a:rPr lang="en-US" sz="2400"><a:solidFill><a:srgbClr val="202020"/></a:solidFill></a:rPr><a:t>${esc(item.text || "Text")}</a:t></a:r>` : "";
  const xml = `<p:sp xmlns:p="${NS.p}" xmlns:a="${NS.a}"><p:nvSpPr><p:cNvPr id="${id}" name="${esc(item.name)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${fill}<a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0"/><a:lstStyle/><a:p>${text}<a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp>`;
  tree.appendChild(parse(xml).documentElement);
  return true;
}
function spTreeOf(doc) {
  return doc.getElementsByTagNameNS(NS.p, "spTree")[0];
}

/** Placeholder boxes from the slide's layout, then master (for placeholders without their own xfrm). */
async function inheritedBoxes(zip, slideFile) {
  const boxes = [];
  let file = slideFile;
  for (const kind of ["slideLayout", "slideMaster"]) {
    const rel = (await relsOf(zip, file)).find((r) => r.type.endsWith(`/${kind}`));
    if (!rel || !zip.file(rel.target)) break;
    const doc = parse(await zip.file(rel.target).async("string"));
    for (const el of topElements(spTreeOf(doc))) {
      const ph = phOf(el);
      const box = xfrmOf(el);
      if (ph && box) boxes.push({ ...ph, box });
    }
    file = rel.target;
  }
  return boxes;
}

// ── 1. manual text edits ─────────────────────────────────────────────────────
function replaceText(el, text) {
  const tx = kid(el, NS.p, "txBody");
  if (!tx) return false;
  const doc = el.ownerDocument;
  const oldPs = kids(tx, NS.a, "p");
  const lines = String(text).replace(/\r\n?/g, "\n").split("\n");
  const templates = oldPs.length ? oldPs : [];
  const newPs = lines.map((line, i) => {
    const tpl = templates[Math.min(i, templates.length - 1)];
    const p = doc.createElementNS(NS.a, "a:p");
    const pPr = tpl && kid(tpl, NS.a, "pPr");
    if (pPr) p.appendChild(pPr.cloneNode(true));
    const firstRun = tpl && kid(tpl, NS.a, "r");
    const rPr = (firstRun && kid(firstRun, NS.a, "rPr")) || (tpl && kid(tpl, NS.a, "endParaRPr"));
    if (line.length) {
      const r = doc.createElementNS(NS.a, "a:r");
      if (rPr) {
        const copy = rPr.cloneNode(true);
        if (copy.localName === "endParaRPr") {
          const renamed = doc.createElementNS(NS.a, "a:rPr");
          for (const attr of Array.from(copy.attributes)) renamed.setAttribute(attr.name, attr.value);
          for (const c of Array.from(copy.childNodes)) renamed.appendChild(c);
          r.appendChild(renamed);
        } else r.appendChild(copy);
      }
      const t = doc.createElementNS(NS.a, "a:t");
      t.appendChild(doc.createTextNode(line));
      r.appendChild(t);
      p.appendChild(r);
    }
    if (rPr) {
      const end = doc.createElementNS(NS.a, "a:endParaRPr");
      for (const attr of Array.from(rPr.attributes)) end.setAttribute(attr.name, attr.value);
      p.appendChild(end);
    }
    return p;
  });
  for (const p of oldPs) tx.removeChild(p);
  for (const p of newPs) tx.appendChild(p);
  return true;
}

function findByName(doc, name) {
  const matches = [];
  const walk = (tree) => {
    for (const el of topElements(tree)) {
      const c = cNvPr(el);
      if (c && c.getAttribute("name") === name) matches.push(el);
      if (el.localName === "grpSp") walk(el);
    }
  };
  walk(spTreeOf(doc));
  return matches;
}

// ── 2. motion ────────────────────────────────────────────────────────────────
const SPEEDS = new Set(["slow", "med", "fast"]);
const DIR4 = { left: "l", right: "r", up: "u", down: "d" };
function transitionXml(t) {
  if (!t || t.type === "none") return "";
  const spd = SPEEDS.has(t.speed) ? t.speed : "med";
  const dir = DIR4[t.direction] || "l";
  const simple = (inner) => `<p:transition spd="${spd}">${inner}</p:transition>`;
  switch (t.type) {
    case "fade": return simple(t.throughBlack ? `<p:fade thruBlk="1"/>` : "<p:fade/>");
    case "push": return simple(`<p:push dir="${dir}"/>`);
    case "wipe": return simple(`<p:wipe dir="${dir}"/>`);
    case "cover": return simple(`<p:cover dir="${dir}"/>`);
    case "pull": return simple(`<p:pull dir="${dir}"/>`);
    case "split": return simple(`<p:split orient="${t.direction === "up" || t.direction === "down" ? "horz" : "vert"}" dir="out"/>`);
    case "zoom": return simple(`<p:zoom dir="${t.direction === "out" ? "out" : "in"}"/>`);
    case "dissolve": return simple("<p:dissolve/>");
    case "morph": {
      const option = ["byObject", "byWord", "byChar"].includes(t.option) ? t.option : "byObject";
      return `<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><mc:Choice xmlns:p159="http://schemas.microsoft.com/office/powerpoint/2015/09/main" Requires="p159"><p:transition spd="slow"><p159:morph option="${option}"/></p:transition></mc:Choice><mc:Fallback><p:transition spd="slow"><p:fade/></p:transition></mc:Fallback></mc:AlternateContent>`;
    }
    default:
      warn(`unknown transition type "${t.type}"; used fade`);
      return simple("<p:fade/>");
  }
}

// Entrance effects. Direction = where the element comes FROM.
const SUBTYPE = { top: 1, right: 2, bottom: 4, left: 8 };
const WIPE_FILTER = { top: "wipe(down)", right: "wipe(left)", bottom: "wipe(up)", left: "wipe(right)" };
function effectBody(a, spid, nextId) {
  const dur = Math.max(100, Math.min(10000, Math.round(a.durationMs || 500)));
  const tgt = `<p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl>`;
  const show = `<p:set><p:cBhvr><p:cTn id="${nextId()}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn>${tgt}<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set>`;
  const prop = (attr, from, to) =>
    `<p:anim calcmode="lin" valueType="num"><p:cBhvr additive="base"><p:cTn id="${nextId()}" dur="${dur}" fill="hold"/>${tgt}<p:attrNameLst><p:attrName>${attr}</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst><p:tav tm="0"><p:val><p:strVal val="${from}"/></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="${to}"/></p:val></p:tav></p:tavLst></p:anim>`;
  const fade = () => `<p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="${nextId()}" dur="${dur}"/>${tgt}</p:cBhvr></p:animEffect>`;
  const fadeOut = () => `<p:animEffect transition="out" filter="fade"><p:cBhvr><p:cTn id="${nextId()}" dur="${dur}"/>${tgt}</p:cBhvr></p:animEffect>`;
  const hide = (at) => `<p:set><p:cBhvr><p:cTn id="${nextId()}" dur="1" fill="hold"><p:stCondLst><p:cond delay="${Math.max(0, at - 1)}"/></p:stCondLst></p:cTn>${tgt}<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="hidden"/></p:to></p:set>`;
  const from = SUBTYPE[a.direction] ? a.direction : "bottom";
  switch (a.effect) {
    case "appear": return { presetID: 1, subtype: 0, body: show };
    case "fly": {
      const x = from === "left" ? "0-#ppt_w/2" : from === "right" ? "1+#ppt_w/2" : "#ppt_x";
      const y = from === "top" ? "0-#ppt_h/2" : from === "bottom" ? "1+#ppt_h/2" : "#ppt_y";
      return { presetID: 2, subtype: SUBTYPE[from], body: show + prop("ppt_x", x, "#ppt_x") + prop("ppt_y", y, "#ppt_y") };
    }
    case "rise": { // fade + short float up ("Rise Up"-like, subtle)
      return { presetID: 42, subtype: 0, body: show + fade() + prop("ppt_x", "#ppt_x", "#ppt_x") + prop("ppt_y", "#ppt_y+.1", "#ppt_y") };
    }
    case "wipe":
      return { presetID: 22, subtype: SUBTYPE[from], body: show + `<p:animEffect transition="in" filter="${WIPE_FILTER[from]}"><p:cBhvr><p:cTn id="${nextId()}" dur="${dur}"/>${tgt}</p:cBhvr></p:animEffect>` };
    case "zoom":
      return { presetID: 53, subtype: 16, body: show + prop("ppt_w", "0", "#ppt_w") + prop("ppt_h", "0", "#ppt_h") + fade() };
    // ── exits: the entrance played out, then hidden ──
    case "disappear":
      return { cls: "exit", presetID: 1, subtype: 0, body: hide(0) };
    case "fadeOut":
      return { cls: "exit", presetID: 10, subtype: 0, body: fadeOut() + hide(dur) };
    case "flyOut": {
      const x = from === "left" ? "0-#ppt_w/2" : from === "right" ? "1+#ppt_w/2" : "#ppt_x";
      const y = from === "top" ? "0-#ppt_h/2" : from === "bottom" ? "1+#ppt_h/2" : "#ppt_y";
      return { cls: "exit", presetID: 2, subtype: SUBTYPE[from], body: prop("ppt_x", "#ppt_x", x) + prop("ppt_y", "#ppt_y", y) + hide(dur) };
    }
    case "wipeOut":
      return { cls: "exit", presetID: 22, subtype: SUBTYPE[from], body: `<p:animEffect transition="out" filter="${WIPE_FILTER[from]}"><p:cBhvr><p:cTn id="${nextId()}" dur="${dur}"/>${tgt}</p:cBhvr></p:animEffect>` + hide(dur) };
    case "zoomOut":
      return { cls: "exit", presetID: 53, subtype: 16, body: prop("ppt_w", "#ppt_w", "0") + prop("ppt_h", "#ppt_h", "0") + fadeOut() + hide(dur) };
    // ── emphasis: the element stays on the slide ──
    case "pulse":
      return { cls: "emph", presetID: 26, subtype: 0, body: `<p:animScale><p:cBhvr><p:cTn id="${nextId()}" dur="${Math.round(dur / 2)}" autoRev="1" fill="hold"/>${tgt}</p:cBhvr><p:by x="108000" y="108000"/></p:animScale>` };
    case "spin": {
      const deg = Number.isFinite(a.degrees) ? a.degrees : 360;
      return { cls: "emph", presetID: 8, subtype: 0, body: `<p:animRot by="${Math.round(deg * 60000)}"><p:cBhvr><p:cTn id="${nextId()}" dur="${dur}" fill="hold"/>${tgt}<p:attrNameLst><p:attrName>r</p:attrName></p:attrNameLst></p:cBhvr></p:animRot>` };
    }
    case "grow": {
      const k = Math.round((Number.isFinite(a.scale) ? a.scale : 1.15) * 100000);
      return { cls: "emph", presetID: 6, subtype: 0, body: `<p:animScale><p:cBhvr><p:cTn id="${nextId()}" dur="${dur}" fill="hold"/>${tgt}</p:cBhvr><p:by x="${k}" y="${k}"/></p:animScale>` };
    }
    case "transparency": {
      const o = Math.min(1, Math.max(0, Number.isFinite(a.opacity) ? a.opacity : 0.5));
      return { cls: "emph", presetID: 9, subtype: 0, body: `<p:set><p:cBhvr><p:cTn id="${nextId()}" dur="${dur}" fill="hold"/>${tgt}<p:attrNameLst><p:attrName>style.opacity</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="${o}"/></p:to></p:set>` };
    }
    case "fade":
    default:
      if (a.effect && a.effect !== "fade") warn(`unknown animation effect "${a.effect}"; used fade`);
      return { presetID: 10, subtype: 0, body: show + fade() };
  }
}

function timingXml(animations, shapes) {
  const valid = [];
  for (const a of animations) {
    const s = shapes.get(a.target);
    if (!s) { warn(`animation target "${a.target}" not found on the slide (objectName must match exactly)`); continue; }
    valid.push({ ...a, spid: s.id, isSp: s.tag === "sp" && s.hasText });
  }
  if (!valid.length) return "";
  let id = 2;
  const nextId = () => ++id;
  const grpIds = new Map(); // `${spid}|${class}` -> grpId
  const grpIdFor = (spid, cls) => {
    const key = `${spid}|${cls}`;
    if (!grpIds.has(key)) grpIds.set(key, [...grpIds.keys()].filter((k) => k.startsWith(`${spid}|`)).length);
    return grpIds.get(key);
  };
  // click groups -> sequential sub-groups (afterPrevious starts a new one) -> parallel effects
  const groups = [];
  for (const a of valid) {
    const trigger = ["onClick", "withPrevious", "afterPrevious"].includes(a.trigger) ? a.trigger : "onClick";
    if (trigger === "onClick" || !groups.length) groups.push({ auto: trigger !== "onClick", subs: [[{ ...a, trigger }]] });
    else if (trigger === "withPrevious") groups[groups.length - 1].subs[groups[groups.length - 1].subs.length - 1].push({ ...a, trigger });
    else groups[groups.length - 1].subs.push([{ ...a, trigger }]);
  }
  let xml = "";
  for (const g of groups) {
    const gid = nextId();
    let subsXml = "";
    let offset = 0;
    for (const sub of g.subs) {
      const sid = nextId();
      let effectsXml = "";
      let longest = 0;
      for (const a of sub) {
        const eid = nextId();
        const nodeType = a.trigger === "withPrevious" ? "withEffect" : a.trigger === "afterPrevious" ? "afterEffect" : "clickEffect";
        const delay = Math.max(0, Math.round(a.delayMs || 0));
        const fx = effectBody(a, a.spid, nextId);
        longest = Math.max(longest, delay + Math.round(a.durationMs || 500));
        const cls = fx.cls || "entr";
        // one build group per animation class on a shape (PowerPoint numbers them per shape)
        const grp = a.isSp ? ` grpId="${grpIdFor(a.spid, cls)}"` : "";
        effectsXml += `<p:par><p:cTn id="${eid}" presetID="${fx.presetID}" presetClass="${cls}" presetSubtype="${fx.subtype}" fill="hold"${grp} nodeType="${nodeType}"><p:stCondLst><p:cond delay="${delay}"/></p:stCondLst><p:childTnLst>${fx.body}</p:childTnLst></p:cTn></p:par>`;
      }
      subsXml += `<p:par><p:cTn id="${sid}" fill="hold"><p:stCondLst><p:cond delay="${offset}"/></p:stCondLst><p:childTnLst>${effectsXml}</p:childTnLst></p:cTn></p:par>`;
      offset += longest;
    }
    const start = g.auto ? `<p:cond delay="indefinite"/><p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond>` : `<p:cond delay="indefinite"/>`;
    xml += `<p:par><p:cTn id="${gid}" fill="hold"><p:stCondLst>${start}</p:stCondLst><p:childTnLst>${subsXml}</p:childTnLst></p:cTn></p:par>`;
  }
  const bld = [...grpIds.entries()].map(([key, g]) => `<p:bldP spid="${key.split("|")[0]}" grpId="${g}"/>`).join("");
  return `<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>${xml}</p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst><p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst>${bld ? `<p:bldLst>${bld}</p:bldLst>` : ""}</p:timing>`;
}

function applyMotion(xml, spec, shapes) {
  // drop what a previous pass (or pptxgenjs) wrote
  xml = xml
    .replace(/<mc:AlternateContent\b(?:(?!<mc:AlternateContent\b)[\s\S])*?<p:transition[\s\S]*?<\/mc:AlternateContent>/g, "")
    .replace(/<p:transition\b[^>]*\/>|<p:transition\b[\s\S]*?<\/p:transition>/g, "")
    .replace(/<p:timing\b[\s\S]*?<\/p:timing>/g, "");
  const frag = transitionXml(spec.transition) + (Array.isArray(spec.animations) ? timingXml(spec.animations, shapes) : "");
  if (!frag) return xml;
  if (xml.includes("</p:clrMapOvr>")) return xml.replace("</p:clrMapOvr>", `</p:clrMapOvr>${frag}`);
  if (/<p:clrMapOvr\b[^>]*\/>/.test(xml)) return xml.replace(/(<p:clrMapOvr\b[^>]*\/>)/, `$1${frag}`);
  return xml.replace("</p:cSld>", `</p:cSld>${frag}`);
}

// ── main ─────────────────────────────────────────────────────────────────────
(async () => {
  if (!fs.existsSync(DECK)) {
    console.error("out/deck.pptx not found");
    process.exit(2);
  }
  const zip = await JSZip.loadAsync(fs.readFileSync(DECK), { createFolders: false });
  const { files, cx, cy } = await slideFiles(zip);
  const edits = readJson("edits.json");
  const motion = readJson("motion.json");
  const textEdits = Array.isArray(edits?.text) ? edits.text : [];
  const elementEdits = Array.isArray(edits?.elements) ? edits.elements : [];
  const transitionEdits = Array.isArray(edits?.transitions) ? edits.transitions : [];
  const addedEdits = Array.isArray(edits?.added) ? edits.added : [];
  const layout = { slideWidthEmu: cx, slideHeightEmu: cy, slides: [] };
  let changed = false;

  for (let i = 0; i < files.length; i += 1) {
    const n = i + 1;
    const file = files[i];
    let xml = await zip.file(file).async("string");
    let doc = parse(xml);

    // 1. text edits
    let edited = false;
    for (const item of addedEdits.filter((entry) => Number(entry.slide) === n)) {
      if (addUserElement(doc, item, cx, cy)) edited = true;
    }
    for (const e of textEdits.filter((t) => Number(t.slide) === n)) {
      const els = findByName(doc, String(e.name));
      if (!els.length) { warn(`edits.json: slide ${n} has no element named "${e.name}" any more; edit not applied`); continue; }
      if (els.length > 1) warn(`edits.json: slide ${n} has ${els.length} elements named "${e.name}"; edited the first`);
      if (replaceText(els[0], e.text)) edited = true;
      else warn(`edits.json: "${e.name}" on slide ${n} has no text box`);
    }
    for (const e of elementEdits.filter((t) => Number(t.slide) === n)) {
      const els = findByName(doc, String(e.name));
      if (!els.length) { warn(`edits.json: slide ${n} has no element named "${e.name}" any more; edit not applied`); continue; }
      const el = els[0];
      if (e.deleted === true) { el.parentNode.removeChild(el); edited = true; continue; }
      if (editShape(el, e, cx, cy)) edited = true;
      else warn(`edits.json: "${e.name}" has no editable transform`);
    }
    if (edited) {
      xml = serialize(doc);
      changed = true;
    }

    // collect elements (names -> ids) and boxes
    const inherited = await inheritedBoxes(zip, file);
    const shapes = new Map();
    const elements = [];
    for (const el of topElements(spTreeOf(doc))) {
      const c = cNvPr(el);
      if (!c) continue;
      const name = c.getAttribute("name") || "";
      if (name === "Octopilot AI Watermark") continue; // stamped by the host, not editable
      const paras = paragraphsOf(el);
      const hasText = !!paras && paras.some((p) => p.trim());
      if (!shapes.has(name)) shapes.set(name, { id: c.getAttribute("id"), tag: el.localName, hasText });
      let box = xfrmOf(el);
      const ph = phOf(el);
      if (!box && ph) {
        const hit = inherited.find((b) => ph.idx && b.idx === ph.idx) || inherited.find((b) => b.type === ph.type);
        box = hit ? hit.box : null;
      }
      if (!box || box.w <= 0 || box.h <= 0) continue;
      const kind = el.localName === "pic" ? "image"
        : el.localName === "graphicFrame" ? (el.getElementsByTagNameNS("http://schemas.openxmlformats.org/drawingml/2006/chart", "chart").length ? "chart" : "table")
        : el.localName === "grpSp" ? "group"
        : hasText ? "text" : "shape";
      elements.push({
        id: c.getAttribute("id"),
        name,
        kind,
        x: box.x / cx, y: box.y / cy, w: box.w / cx, h: box.h / cy,
        rot: box.rot ? box.rot / 60000 : 0,
        ...(kind === "text" ? { text: paras.join("\n"), format: textFormatOf(el) } : {}),
        ...(ph ? { placeholder: ph.type } : {}),
      });
    }

    // 2. motion. Supply a restrained transition and entrance when the agent
    // did not write motion.json, so exported PowerPoint files still move.
    let slideChanged = edited;
    let transitionType = "none";
    if (motion?.disabled !== true) {
      const own = motion?.slides?.[String(n)] || {};
      const manualTransition = transitionEdits.find((e) => Number(e.slide) === n);
      const firstText = elements.find((el) => el.kind === "text" && el.name);
      const firstNamed = firstText || elements.find((el) => el.name);
      const automaticEntrance = firstNamed
        ? [{ target: firstNamed.name, effect: "fade", trigger: "withPrevious", durationMs: 550 }]
        : [];
      const manualAnimations = elementEdits.filter((e) => Number(e.slide) === n && e.deleted !== true)
        .flatMap((e) => Array.isArray(e.animations) ? e.animations.map((a) => ({ target: String(e.name), effect: a.effect, trigger: a.trigger || "onClick", durationMs: a.durationMs || 650, delayMs: a.delayMs || 0 }))
          : e.animation && e.animation !== "none" ? [{ target: String(e.name), effect: e.animation, trigger: "onClick", durationMs: 650 }] : []);
      const animationOverrides = new Set(elementEdits.filter((e) => Number(e.slide) === n && Array.isArray(e.animations)).map((e) => String(e.name)));
      const merged = {
        transition: manualTransition ? { type: manualTransition.transition, speed: "med" } : own.transition ?? motion?.default?.transition ?? { type: "fade", speed: "med" },
        animations: [...(Array.isArray(own.animations) && own.animations.length ? own.animations : automaticEntrance).filter((a) => !animationOverrides.has(String(a.target))), ...manualAnimations],
      };
      transitionType = merged.transition?.type || "none";
      const next = applyMotion(xml, merged, shapes);
      if (next !== xml) { xml = next; slideChanged = true; changed = true; }
      for (const element of elements) {
        element.animations = merged.animations.filter((a) => a.target === element.name).map((a) => ({ effect: a.effect, trigger: a.trigger || "onClick", durationMs: a.durationMs || 650, delayMs: a.delayMs || 0 }));
        const override = elementEdits.find((e) => Number(e.slide) === n && e.name === element.name);
        if (override?.format) element.format = { ...element.format, ...override.format };
      }
    }
    if (slideChanged) zip.file(file, xml);

    layout.slides.push({ slide: n, elements, transition: transitionType });
  }

  const hasFolders = Object.values(zip.files).some((f) => f.dir);
  if (changed || hasFolders) {
    // JSZip adds folder entries, which cloud editors choke on
    // (delete the entries directly: zip.remove() on a folder removes its contents too)
    for (const name of Object.keys(zip.files)) if (zip.files[name].dir) delete zip.files[name];
    const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    fs.writeFileSync(DECK + ".tmp", buf);
    fs.renameSync(DECK + ".tmp", DECK);
  }
  fs.writeFileSync(path.join(WORK, "out", "layout.json"), JSON.stringify(layout));
  for (const w of warnings) console.error(`warning: ${w}`);
  console.log(`postbuild: ${files.length} slides; ${textEdits.length} text edit(s); motion ${motion?.disabled === true ? "disabled" : motion ? "applied" : "automatic"}`);
})().catch((e) => {
  console.error(`postbuild failed: ${e && e.stack ? e.stack : e}`);
  process.exit(1);
});
