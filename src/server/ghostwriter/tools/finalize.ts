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
  nextRecommendedAction: string;
};

export const finalizeExportTool: Tool<FinalizeArgs, FinalizeResult> = {
  name: "finalize_export",
  description:
    "Package the drafted essay into an export snapshot. Pass the formatting metadata (studentName, instructorName, etc.) that was collected via ask_user as individual named args — they are merged into the export and override any prior context values. Reads essay, bibliography, and citation style from context. Use this after collecting all required metadata.",
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

    // Merge any args passed this call into context first, then validate.
    ctx.formatAnswers = {
      ...ctx.formatAnswers,
      ...Object.fromEntries(
        Object.entries(args).filter(([, value]) => typeof value === "string" && value.trim().length > 0),
      ),
    };

    // Enforce that all required metadata fields for the confirmed citation style
    // are present before building the export. Missing fields must be collected
    // via ask_user — the agent cannot proceed without them.
    const style = (ctx.draftSettings.citationStyle ?? "").toUpperCase();
    const REQUIRED: Record<string, { field: string; question: string }[]> = {
      APA: [
        { field: "studentName",     question: "What is the student's full name?" },
        { field: "instructorName",  question: "What is the instructor's name?" },
        { field: "institutionName", question: "What is the institution or university name?" },
        { field: "courseInfo",      question: "What is the course name and number?" },
        { field: "essayDate",       question: "What date should appear on the essay?" },
      ],
      MLA: [
        { field: "studentName",    question: "What is the student's full name?" },
        { field: "instructorName", question: "What is the instructor's name?" },
        { field: "courseInfo",     question: "What is the course name and number?" },
        { field: "essayDate",      question: "What date should appear on the essay?" },
      ],
      CHICAGO: [
        { field: "studentName",     question: "What is the student's full name?" },
        { field: "institutionName", question: "What is the institution or university name?" },
        { field: "essayDate",       question: "What date should appear on the essay?" },
      ],
      HARVARD: [
        { field: "studentName",     question: "What is the student's full name?" },
        { field: "institutionName", question: "What is the institution or university name?" },
        { field: "courseInfo",      question: "What is the course name and number?" },
        { field: "essayDate",       question: "What date should appear on the essay?" },
      ],
      IEEE: [
        { field: "institutionName", question: "What is the institution or university name?" },
      ],
    };
    const required = REQUIRED[style] ?? [];
    const missing = required.filter(
      ({ field }) => !ctx.formatAnswers[field as keyof typeof ctx.formatAnswers]?.trim(),
    );
    if (missing.length > 0) {
      const calls = missing
        .map(({ field, question }) => `ask_user(field="${field}", question="${question}")`)
        .join(", then ");
      throw new Error(
        `finalize_export: missing required metadata for ${style}: ` +
          missing.map(({ field }) => field).join(", ") +
          `. Collect each field first: ${calls}.`,
      );
    }

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
      nextRecommendedAction: "ask_user(humanizerChoice)",
    };
  },
};
