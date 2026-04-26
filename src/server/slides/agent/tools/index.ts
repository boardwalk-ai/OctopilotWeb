import type { AnyTool } from "../tools";
import { analyze_instruction } from "./analyze_instruction";
import { ask_user } from "./ask_user";
import { create_slides } from "./create_slides";
import { write_slide } from "./write_slide";
import { design_brief } from "./design_brief";
import { design_slide } from "./design_slide";
import { critique_slide } from "./critique_slide";
import { compose } from "./compose";
import { update_deck_theme } from "./update_deck_theme";
import { update_element } from "./update_element";
import { add_element } from "./add_element";
import { remove_element } from "./remove_element";

export const SLIDES_TOOLS: AnyTool[] = [
  analyze_instruction,
  ask_user,
  create_slides,
  write_slide,
  design_brief,
  design_slide,
  critique_slide,
  compose,
  update_deck_theme,
  update_element,
  add_element,
  remove_element,
];
