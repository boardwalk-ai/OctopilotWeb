import type { Tool } from "@/server/ghostwriter/agent/tools";
import { emit } from "@/server/ghostwriter/agent/runs";
import { buildExportDocumentSnapshot } from "@/server/ghostwriter/export";

type FinalizeArgs = {
  finalEssayTitle?: string;
  studentName?: string;
  instructorName?: string;
  institutionName?: string;
  courseInfo?: string;
  subjectCode?: string;
  essayDate?: string;
};

type FinalizeResult = {
  title: string;
  pageCount: number;
};

export const finalizeExportTool: Tool<FinalizeArgs, FinalizeResult> = {
  name: "finalize_export",
  description:
    "Package the drafted essay into an export snapshot. Reads essay, bibliography, citation style, and any formatting metadata from context. Use this after write_essay succeeds.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      finalEssayTitle: { type: "string" },
      studentName: { type: "string" },
      instructorName: { type: "string" },
      institutionName: { type: "string" },
      courseInfo: { type: "string" },
      subjectCode: { type: "string" },
      essayDate: { type: "string" },
    },
  },
  stepTitle: () => "Finalizing export",
  async execute(args, { run }) {
    const ctx = run.context;
    if (!ctx.essay?.trim()) {
      throw new Error("finalize_export: essay is missing — run write_essay first.");
    }

    ctx.formatAnswers = {
      ...ctx.formatAnswers,
      ...Object.fromEntries(
        Object.entries(args).filter(([, value]) => typeof value === "string" && value.trim().length > 0),
      ),
    };

    const exportDoc = buildExportDocumentSnapshot(ctx);
    ctx.exportDoc = exportDoc;
    ctx.exportReady = true;

    emit(run, {
      type: "context_update",
      patch: {
        formatAnswers: ctx.formatAnswers,
        exportReady: true,
        exportDoc,
      },
    });

    return {
      title: exportDoc.title,
      pageCount: exportDoc.pages.length,
    };
  },
};
