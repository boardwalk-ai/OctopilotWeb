import { createHash } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import JSZip from "jszip";
import sharp from "sharp";
import { query } from "@/server/db";
import { ownToSandbox } from "@/server/octoslides/workspace";

/**
 * Octopilot AI marks on OctoSlides decks. Applied on the host (never in the
 * sandbox), after every build and again on every download, so nothing the model
 * writes - build.js, edits.json, motion.json - can remove them.
 *
 *  - visible badge: the Octopilot AI logo, bottom-right of every slide.
 *    Free plan: always on (an admin can turn it off globally or per account).
 *    Pro plan: on by default, the owner can switch it off.
 *  - deep mark (every plan, always): document properties name Octopilot AI as
 *    the creator/application and carry the deck id and generation time.
 */

export const WATERMARK_NAME = "Octopilot AI Watermark";
const MEDIA_PATH = "ppt/media/octopilot-ai-badge.png";
const REL_ID = "rIdOctopilotAiBadge";
const NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";

// ── policy ───────────────────────────────────────────────────────────────────
export type WatermarkPolicy = { freeWatermark: boolean; exemptEmails: string[] };
let policyCache: { value: WatermarkPolicy; at: number } | null = null;

export async function getWatermarkPolicy(fresh = false): Promise<WatermarkPolicy> {
  if (!fresh && policyCache && Date.now() - policyCache.at < 30_000) return policyCache.value;
  const rows = await query<{ free_watermark: boolean; exempt_emails: string[] }>(
    "SELECT free_watermark, exempt_emails FROM octoslides_policy WHERE id = 1",
  ).catch(() => []);
  const value = { freeWatermark: rows[0]?.free_watermark ?? true, exemptEmails: (rows[0]?.exempt_emails ?? []).map((e) => e.toLowerCase()) };
  policyCache = { value, at: Date.now() };
  return value;
}

export async function setWatermarkPolicy(policy: WatermarkPolicy, updatedBy: string | null): Promise<WatermarkPolicy> {
  const emails = [...new Set(policy.exemptEmails.map((e) => e.trim().toLowerCase()).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)))].slice(0, 500);
  await query(
    `INSERT INTO octoslides_policy (id, free_watermark, exempt_emails, updated_by, updated_at) VALUES (1, $1, $2, $3, now())
     ON CONFLICT (id) DO UPDATE SET free_watermark = $1, exempt_emails = $2, updated_by = $3, updated_at = now()`,
    [policy.freeWatermark, emails, updatedBy],
  );
  policyCache = null;
  return getWatermarkPolicy(true);
}

/** What the owner of a run gets: whether the badge is shown and whether they may switch it. */
export async function watermarkState(run: { email: string; isPro: boolean; watermarkOptOut: boolean }) {
  const policy = await getWatermarkPolicy();
  if (run.isPro) return { enabled: !run.watermarkOptOut, canToggle: true, reason: "pro" as const };
  const exempt = !policy.freeWatermark || policy.exemptEmails.includes(run.email.toLowerCase());
  if (exempt) return { enabled: !run.watermarkOptOut, canToggle: true, reason: "admin" as const };
  return { enabled: true, canToggle: false, reason: "free" as const };
}

// ── badge image ──────────────────────────────────────────────────────────────
let badgeCache: Promise<{ png: Buffer; aspect: number }> | null = null;

/** Dark pill with the Octopilot AI wordmark: readable on light and dark slides. */
function badge() {
  badgeCache ??= (async () => {
    const logo = await sharp(join(process.cwd(), "public", "logoText.png")).trim().png().toBuffer();
    const meta = await sharp(logo).metadata();
    const logoH = 96;
    const logoW = Math.round(((meta.width ?? 400) / (meta.height ?? 40)) * logoH);
    const padX = 54;
    const padY = 34;
    const W = logoW + padX * 2;
    const H = logoH + padY * 2;
    const pill = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" rx="${H / 2}" fill="#0B0B0C" fill-opacity="0.78"/><rect x="1.5" y="1.5" width="${W - 3}" height="${H - 3}" rx="${(H - 3) / 2}" fill="none" stroke="#FFFFFF" stroke-opacity="0.14" stroke-width="3"/></svg>`,
    );
    const resized = await sharp(logo).resize({ height: logoH }).toBuffer();
    const png = await sharp(pill).composite([{ input: resized, left: padX, top: padY }]).png().toBuffer();
    return { png, aspect: W / H };
  })();
  return badgeCache;
}

// ── XML helpers ──────────────────────────────────────────────────────────────
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function removeBadge(slideXml: string): string {
  return slideXml.replace(new RegExp(`<p:pic>(?:(?!<p:pic>)[\\s\\S])*?name="${WATERMARK_NAME}"[\\s\\S]*?</p:pic>`, "g"), "");
}

function badgeXml(id: number, x: number, y: number, cx: number, cy: number): string {
  return (
    `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${WATERMARK_NAME}" descr="Made with Octopilot AI (octopilotai.app)"/>` +
    `<p:cNvPicPr><a:picLocks noGrp="1" noSelect="1" noRot="1" noChangeAspect="1" noMove="1" noResize="1" noEditPoints="1" noAdjustHandles="1" noChangeArrowheads="1" noChangeShapeType="1" noCrop="1"/></p:cNvPicPr><p:nvPr userDrawn="1"/></p:nvPicPr>` +
    `<p:blipFill><a:blip r:embed="${REL_ID}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
    `<p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`
  );
}

function setRel(relsXml: string | null): string {
  const rel = `<Relationship Id="${REL_ID}" Type="${NS_REL}" Target="../media/octopilot-ai-badge.png"/>`;
  if (!relsXml) return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rel}</Relationships>`;
  if (relsXml.includes(`Id="${REL_ID}"`)) return relsXml;
  return relsXml.replace("</Relationships>", `${rel}</Relationships>`);
}

function upsertTag(xml: string, tag: string, value: string, attrs = ""): string {
  const re = new RegExp(`<${tag}(\\s[^>]*)?(/>|>[\\s\\S]*?</${tag}>)`);
  const el = `<${tag}${attrs}>${esc(value)}</${tag}>`;
  return re.test(xml) ? xml.replace(re, el) : xml.replace(/(<\/[a-zA-Z:]+Properties>)\s*$/, `${el}$1`);
}

async function deepMark(zip: JSZip, deckId: string) {
  const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const fingerprint = createHash("sha256").update(`octopilot-ai:${deckId}`).digest("hex").slice(0, 24);

  // core properties
  const corePath = "docProps/core.xml";
  let core =
    (await zip.file(corePath)?.async("string")) ??
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"></cp:coreProperties>`;
  core = upsertTag(core, "dc:creator", "Octopilot AI");
  core = upsertTag(core, "cp:lastModifiedBy", "Octopilot AI");
  core = upsertTag(core, "dc:description", `Generated with OctoSlides by Octopilot AI (https://octopilotai.app). Deck ${fingerprint}.`);
  core = upsertTag(core, "cp:keywords", "Octopilot AI; OctoSlides");
  core = upsertTag(core, "dc:identifier", `octopilot-ai:${fingerprint}`);
  core = upsertTag(core, "dcterms:modified", now, ' xsi:type="dcterms:W3CDTF"');
  zip.file(corePath, core);

  // extended (app) properties
  const appPath = "docProps/app.xml";
  let app = await zip.file(appPath)?.async("string");
  if (app) {
    app = upsertTag(app, "Application", "Octopilot AI OctoSlides");
    app = upsertTag(app, "Company", "Octopilot AI");
    zip.file(appPath, app);
  }

  // custom properties
  const props: Array<[string, string]> = [
    ["GeneratedBy", "Octopilot AI"],
    ["Generator", "OctoSlides"],
    ["GeneratorUrl", "https://octopilotai.app"],
    ["OctopilotDeckId", fingerprint],
    ["OctopilotGeneratedAt", now],
  ];
  const custom =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">` +
    props.map(([name, value], i) => `<property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="${i + 2}" name="${name}"><vt:lpwstr>${esc(value)}</vt:lpwstr></property>`).join("") +
    `</Properties>`;
  zip.file("docProps/custom.xml", custom);

  const rootRels = (await zip.file("_rels/.rels")?.async("string")) ?? "";
  if (rootRels && !rootRels.includes("docProps/custom.xml")) {
    zip.file(
      "_rels/.rels",
      rootRels.replace(
        "</Relationships>",
        `<Relationship Id="rIdOctopilotCustom" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties" Target="docProps/custom.xml"/></Relationships>`,
      ),
    );
  }
  const types = (await zip.file("[Content_Types].xml")?.async("string")) ?? "";
  let nextTypes = types;
  if (!nextTypes.includes('PartName="/docProps/custom.xml"')) {
    nextTypes = nextTypes.replace("</Types>", `<Override PartName="/docProps/custom.xml" ContentType="application/vnd.openxmlformats-officedocument.custom-properties+xml"/></Types>`);
  }
  if (!/Extension="png"/i.test(nextTypes)) nextTypes = nextTypes.replace("</Types>", `<Default Extension="png" ContentType="image/png"/></Types>`);
  if (nextTypes !== types) zip.file("[Content_Types].xml", nextTypes);
}

/** Applies (or removes) the badge and always applies the deep mark. Idempotent. */
export async function stampDeckBuffer(input: Buffer, opts: { watermark: boolean; deckId: string }): Promise<Buffer> {
  const zip = await JSZip.loadAsync(input);
  const pres = (await zip.file("ppt/presentation.xml")?.async("string")) ?? "";
  const sz = pres.match(/<p:sldSz[^>]*cx="(\d+)"[^>]*cy="(\d+)"/);
  const slideW = sz ? Number(sz[1]) : 12192000;
  const slideH = sz ? Number(sz[2]) : 6858000;

  const { png, aspect } = await badge();
  const EMU_IN = 914400;
  const cy = Math.round(0.3 * EMU_IN * (slideW / 12192000));
  const cx = Math.round(cy * aspect);
  const margin = Math.round(0.22 * EMU_IN * (slideW / 12192000));
  const x = slideW - cx - margin;
  const y = slideH - cy - margin;

  const slides = Object.keys(zip.files).filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p));
  for (const path of slides) {
    let xml = removeBadge(await zip.file(path)!.async("string"));
    if (opts.watermark) {
      const ids = [...xml.matchAll(/<p:cNvPr[^>]*\sid="(\d+)"/g)].map((m) => Number(m[1]));
      const id = Math.max(1, ...ids) + 1;
      // last child of spTree = drawn on top of everything the model placed
      const idx = xml.lastIndexOf("</p:spTree>");
      if (idx >= 0) xml = xml.slice(0, idx) + badgeXml(id, x, y, cx, cy) + xml.slice(idx);
    }
    const relsPath = path.replace("ppt/slides/", "ppt/slides/_rels/") + ".rels";
    const rels = (await zip.file(relsPath)?.async("string")) ?? null;
    if (opts.watermark) zip.file(relsPath, setRel(rels));
    else if (rels?.includes(`Id="${REL_ID}"`)) zip.file(relsPath, rels.replace(new RegExp(`<Relationship [^>]*Id="${REL_ID}"[^>]*/>`), ""));
    zip.file(path, xml);
  }
  if (opts.watermark) zip.file(MEDIA_PATH, png);
  else zip.remove(MEDIA_PATH);
  await deepMark(zip, opts.deckId);
  for (const name of Object.keys(zip.files)) if (zip.files[name].dir) delete zip.files[name];
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

/** Stamps out/deck.pptx in place (atomic), keeping it writable for the sandbox. */
export async function stampDeckFile(dir: string, opts: { watermark: boolean; deckId: string }): Promise<void> {
  const file = join(dir, "out", "deck.pptx");
  const input = await readFile(file).catch(() => null);
  if (!input) return;
  const out = await stampDeckBuffer(input, opts);
  await writeFile(`${file}.stamp`, out, { mode: 0o644 });
  await ownToSandbox(`${file}.stamp`);
  await rename(`${file}.stamp`, file);
}
