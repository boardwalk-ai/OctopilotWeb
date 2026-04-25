import JSZip from "jszip";
import { Buffer } from "node:buffer";
import type { SlideSpec, TransitionSpec } from "@/types/slides";

const PUSH_DIR: Record<NonNullable<TransitionSpec["direction"]>, string> = {
  left: "l",
  right: "r",
  up: "u",
  down: "d",
};

function transitionFragment(spec: TransitionSpec | undefined): string {
  if (!spec || spec.type === "none") return "";
  const spd = "med";
  if (spec.type === "fade") {
    return `<p:transition spd="${spd}"><p:fade/></p:transition>`;
  }
  if (spec.type === "push") {
    const d = PUSH_DIR[spec.direction ?? "left"] ?? "l";
    return `<p:transition spd="${spd}"><p:push p:dir="${d}"/></p:transition>`;
  }
  return `<p:transition spd="${spd}"><p:fade/></p:transition>`;
}

/** Post-process a PptxGenJS buffer: inject OOXML slide transitions (library has no API). */
export async function injectPptxSlideTransitions(
  buffer: Uint8Array,
  slidesOrdered: SlideSpec[],
): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(Buffer.from(buffer));

  for (let i = 0; i < slidesOrdered.length; i++) {
    const path = `ppt/slides/slide${i + 1}.xml`;
    const entry = zip.file(path);
    if (!entry) continue;

    let xml = await entry.async("string");
    if (xml.includes("<p:transition")) continue;

    const frag = transitionFragment(slidesOrdered[i].transition);
    if (!frag) continue;

    if (xml.includes("</p:clrMapOvr>")) {
      xml = xml.replace("</p:clrMapOvr>", `</p:clrMapOvr>${frag}`);
    } else {
      xml = xml.replace("</p:cSld>", `</p:cSld>${frag}`);
    }
    zip.file(path, xml);
  }

  const out = await zip.generateAsync({ type: "uint8array" });
  return out;
}
