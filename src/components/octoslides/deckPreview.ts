"use client";

import JSZip from "jszip";

/**
 * Unsaved editor changes applied to a copy of the deck in the browser, so the
 * engine can draw them before they are saved. It mirrors what the sandbox's
 * postbuild does with edits.json (text, position and size, rotation, fill, text
 * format, delete, new text boxes and shapes). The saved deck from the server
 * always replaces this preview.
 */

export type PendingEdit = Record<string, unknown> & { slide: number };

const P = "http://schemas.openxmlformats.org/presentationml/2006/main";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const REL = "http://schemas.openxmlformats.org/package/2006/relationships";

const kids = (node: Element | null, ns: string, local?: string) =>
  Array.from(node ? node.childNodes : []).filter((n): n is Element => n.nodeType === 1 && (n as Element).namespaceURI === ns && (!local || (n as Element).localName === local));
const kid = (node: Element | null, ns: string, local: string) => kids(node, ns, local)[0] ?? null;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function resolve(from: string, target: string) {
  const parts = from.split("/").slice(0, -1);
  for (const seg of target.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

async function slideFiles(zip: JSZip) {
  const parse = (x: string) => new DOMParser().parseFromString(x, "application/xml");
  const pres = parse(await zip.file("ppt/presentation.xml")!.async("string"));
  const rels = parse(await zip.file("ppt/_rels/presentation.xml.rels")!.async("string"));
  const byId = new Map(Array.from(rels.getElementsByTagNameNS(REL, "Relationship")).map((r) => [r.getAttribute("Id"), resolve("ppt/presentation.xml", r.getAttribute("Target") ?? "")]));
  const sz = pres.getElementsByTagNameNS(P, "sldSz")[0];
  return {
    files: Array.from(pres.getElementsByTagNameNS(P, "sldId")).map((s) => byId.get(s.getAttributeNS(R, "id"))).filter((f): f is string => !!f),
    cx: Number(sz?.getAttribute("cx") || 12192000),
    cy: Number(sz?.getAttribute("cy") || 6858000),
  };
}

function cNvPr(el: Element) {
  const nv = Array.from(el.children).find((n) => /^nv/.test(n.localName)) ?? null;
  return kid(nv, P, "cNvPr");
}
function findByName(doc: Document, name: string) {
  const out: Element[] = [];
  const walk = (tree: Element) => {
    for (const el of Array.from(tree.children)) {
      if (el.namespaceURI !== P || !["sp", "pic", "graphicFrame", "grpSp", "cxnSp"].includes(el.localName)) continue;
      if (cNvPr(el)?.getAttribute("name") === name) out.push(el);
      if (el.localName === "grpSp") walk(el);
    }
  };
  const tree = doc.getElementsByTagNameNS(P, "spTree")[0];
  if (tree) walk(tree);
  return out;
}

function solidFill(doc: Document, hex: string) {
  const solid = doc.createElementNS(A, "a:solidFill");
  const rgb = doc.createElementNS(A, "a:srgbClr");
  rgb.setAttribute("val", hex);
  solid.appendChild(rgb);
  return solid;
}
const FILLS = ["solidFill", "gradFill", "pattFill", "blipFill", "noFill"];

function replaceText(el: Element, text: string) {
  const tx = kid(el, P, "txBody");
  if (!tx) return;
  const doc = el.ownerDocument;
  const old = kids(tx, A, "p");
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const fresh = lines.map((line, i) => {
    const tpl = old[Math.min(i, old.length - 1)];
    const p = doc.createElementNS(A, "a:p");
    const pPr = tpl && kid(tpl, A, "pPr");
    if (pPr) p.appendChild(pPr.cloneNode(true));
    const firstRun = tpl && kid(tpl, A, "r");
    const rPr = (firstRun && kid(firstRun, A, "rPr")) || (tpl && kid(tpl, A, "endParaRPr"));
    if (line.length) {
      const r = doc.createElementNS(A, "a:r");
      if (rPr) {
        const copy = doc.createElementNS(A, "a:rPr");
        for (const attr of Array.from(rPr.attributes)) copy.setAttribute(attr.name, attr.value);
        for (const c of Array.from(rPr.childNodes)) copy.appendChild(c.cloneNode(true));
        r.appendChild(copy);
      }
      const t = doc.createElementNS(A, "a:t");
      t.textContent = line;
      r.appendChild(t);
      p.appendChild(r);
    }
    return p;
  });
  for (const p of old) tx.removeChild(p);
  for (const p of fresh) tx.appendChild(p);
}

function editShape(el: Element, e: PendingEdit, cx: number, cy: number) {
  const doc = el.ownerDocument;
  const spPr = kid(el, P, "spPr");
  const xfrm = el.localName === "graphicFrame" ? kid(el, P, "xfrm") : kid(spPr, A, "xfrm");
  const off = kid(xfrm, A, "off");
  const ext = kid(xfrm, A, "ext");
  const num = (k: string) => (typeof e[k] === "number" && Number.isFinite(e[k]) ? (e[k] as number) : null);
  if (off && num("x") !== null) off.setAttribute("x", String(Math.round(num("x")! * cx)));
  if (off && num("y") !== null) off.setAttribute("y", String(Math.round(num("y")! * cy)));
  if (ext && num("w") !== null) ext.setAttribute("cx", String(Math.round(num("w")! * cx)));
  if (ext && num("h") !== null) ext.setAttribute("cy", String(Math.round(num("h")! * cy)));
  if (xfrm && num("rot") !== null) xfrm.setAttribute("rot", String(Math.round(num("rot")! * 60000)));
  if (typeof e.fill === "string" && spPr) {
    for (const f of kids(spPr, A).filter((n) => FILLS.includes(n.localName))) spPr.removeChild(f);
    const before = kids(spPr, A).find((n) => ["ln", "effectLst", "effectDag", "scene3d", "sp3d"].includes(n.localName));
    spPr.insertBefore(solidFill(doc, e.fill), before ?? null);
  }
  const f = e.format as { bold?: boolean; italic?: boolean; underline?: boolean; align?: string; color?: string; size?: number; font?: string } | undefined;
  const tx = kid(el, P, "txBody");
  if (!f || !tx) return;
  for (const para of kids(tx, A, "p")) {
    if (f.align) {
      let pPr = kid(para, A, "pPr");
      if (!pPr) {
        pPr = doc.createElementNS(A, "a:pPr");
        para.insertBefore(pPr, para.firstChild);
      }
      pPr.setAttribute("algn", ({ left: "l", center: "ctr", right: "r", justify: "just" } as Record<string, string>)[f.align] ?? "l");
    }
    for (const run of kids(para, A, "r")) {
      let pr = kid(run, A, "rPr");
      if (!pr) {
        pr = doc.createElementNS(A, "a:rPr");
        run.insertBefore(pr, run.firstChild);
      }
      if (typeof f.bold === "boolean") pr.setAttribute("b", f.bold ? "1" : "0");
      if (typeof f.italic === "boolean") pr.setAttribute("i", f.italic ? "1" : "0");
      if (typeof f.underline === "boolean") pr.setAttribute("u", f.underline ? "sng" : "none");
      if (f.size) pr.setAttribute("sz", String(Math.round(f.size * 100)));
      if (f.font) {
        let latin = kid(pr, A, "latin");
        if (!latin) {
          latin = doc.createElementNS(A, "a:latin");
          pr.appendChild(latin);
        }
        latin.setAttribute("typeface", f.font);
      }
      if (f.color) {
        for (const old of kids(pr, A).filter((n) => FILLS.includes(n.localName))) pr.removeChild(old);
        const before = kids(pr, A).find((n) => ["latin", "ea", "cs", "sym", "hlinkClick", "hlinkMouseOver", "rtl"].includes(n.localName));
        pr.insertBefore(solidFill(doc, f.color), before ?? null);
      }
    }
  }
}

function addElement(doc: Document, e: PendingEdit, cx: number, cy: number) {
  const name = String(e.name);
  if (findByName(doc, name).length) return;
  const tree = doc.getElementsByTagNameNS(P, "spTree")[0];
  const ids = Array.from(doc.getElementsByTagNameNS(P, "cNvPr")).map((el) => Number(el.getAttribute("id")) || 0);
  const id = Math.max(1, ...ids) + 1;
  const kind = e.add === "shape" ? "shape" : "text";
  const [x, y, w, h] = [Number(e.x) * cx, Number(e.y) * cy, Number(e.w) * cx, Number(e.h) * cy].map(Math.round);
  const fill = kind === "shape" ? `<a:solidFill><a:srgbClr val="${esc(String(e.fill ?? "4472C4"))}"/></a:solidFill>` : "<a:noFill/>";
  const text = kind === "text" ? `<a:r><a:rPr lang="en-US" sz="2400"><a:solidFill><a:srgbClr val="202020"/></a:solidFill></a:rPr><a:t>Text</a:t></a:r>` : "";
  const xml = `<p:sp xmlns:p="${P}" xmlns:a="${A}"><p:nvSpPr><p:cNvPr id="${id}" name="${esc(name)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${fill}<a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0"/><a:lstStyle/><a:p>${text}<a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp>`;
  const node = new DOMParser().parseFromString(xml, "application/xml").documentElement;
  tree?.appendChild(doc.importNode(node, true));
}

/** The deck with `edits` applied, for the engine to draw. */
export async function previewDeck(pptx: ArrayBuffer, edits: PendingEdit[]): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(pptx);
  const { files, cx, cy } = await slideFiles(zip);
  const slides = new Set(edits.map((e) => e.slide));
  for (const n of slides) {
    const file = files[n - 1];
    if (!file || !zip.file(file)) continue;
    const doc = new DOMParser().parseFromString(await zip.file(file)!.async("string"), "application/xml");
    const mine = edits.filter((e) => e.slide === n);
    // same order as postbuild: new elements, then text, then everything else
    for (const e of mine.filter((e) => e.add)) addElement(doc, e, cx, cy);
    for (const e of mine.filter((e) => typeof e.text === "string" && !e.add)) {
      const el = findByName(doc, String(e.name))[0];
      if (el) replaceText(el, String(e.text));
    }
    for (const e of mine.filter((e) => !e.add && typeof e.text !== "string" && typeof e.name === "string")) {
      const el = findByName(doc, String(e.name))[0];
      if (!el) continue;
      if (e.deleted === true) el.parentNode?.removeChild(el);
      else editShape(el, e, cx, cy);
    }
    zip.file(file, new XMLSerializer().serializeToString(doc));
  }
  return zip.generateAsync({ type: "arraybuffer", compression: "STORE" });
}
