import { emit, type OctoSlidesRun } from "@/server/octoslides/runs";
import { stampDeckFile, watermarkState } from "@/server/octoslides/stamp";

/** Re-applies the badge (per plan/policy) and the deep mark to the run's deck; tells the UI. */
export async function applyMarks(run: OctoSlidesRun) {
  const state = await watermarkState(run);
  await stampDeckFile(run.dir, { watermark: state.enabled, deckId: run.runId });
  emit(run, { type: "watermark", ...state });
  return state;
}
