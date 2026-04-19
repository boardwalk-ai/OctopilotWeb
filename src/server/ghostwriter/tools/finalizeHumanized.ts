// `finalize_export_humanized` tool — packages ctx.humanizedContent into an
// export snapshot that the client can paginate and download as a PDF.
//
// Mirrors finalize_export but reads `humanizedContent` instead of `essay`.
// Call this AFTER split_paragraphs succeeds.
//
// Reads: ctx.humanizedContent, ctx.draftSettings, ctx.formatAnswers
// Writes: ctx.humanizedExportDoc, emits context_update

import type { Tool } from "@/server/ghostwriter/agent/tools";
import { emit } from "@/server/ghostwriter/agent/runs";
import { buildExportDocumentSnapshot } from "@/server/ghostwriter/export";

type FinalizeHumanizedArgs = Record<string, never>;

type FinalizeHumanizedResult = {
  title: string;
  pageCount: number;
};

export const finalizeExportHumanizedTool: Tool<FinalizeHumanizedArgs, FinalizeHumanizedResult> = {
  name: "finalize_export_humanized",
  description:
    "Package the humanized essay into an export snapshot. Reads ctx.humanizedContent (set by humanize_essay + split_paragraphs). Emits humanizedExportDoc so the client can show the humanized editor and download card. Call this AFTER split_paragraphs.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {},
  },
  stepTitle: () => "Packaging humanized document",
  async execute(_args, { run }) {
    const ctx = run.context;
    if (!ctx.humanizedContent?.trim()) {
      throw new Error(
        "finalize_export_humanized: humanizedContent is missing — run humanize_essay and split_paragraphs first.",
      );
    }

    const exportDoc = buildExportDocumentSnapshot(ctx, ctx.humanizedContent);
    ctx.humanizedExportDoc = exportDoc;

    emit(run, {
      type: "context_update",
      patch: { humanizedExportDoc: exportDoc },
    });

    return { title: exportDoc.title, pageCount: exportDoc.pages.length };
  },
};
