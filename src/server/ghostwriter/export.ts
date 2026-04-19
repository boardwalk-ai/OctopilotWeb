import type {
  ExportDocumentSnapshot,
  ExportPageSnapshot,
} from "@/services/OrganizerService";
import { FormatterService } from "@/services/FormatterService";
import type { FormatterInput, FormatterOutput, FormatterPage } from "@/services/FormatterTypes";
import type { AgentContext } from "./agent/context";

function normalizeHtmlFromContent(content: string): string {
  return content
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${block.replace(/\n/g, "<br />")}</p>`)
    .join("");
}

function buildFormatterInput(ctx: AgentContext): FormatterInput {
  const finalEssayTitle =
    ctx.formatAnswers.finalEssayTitle?.trim() || ctx.essayTopic || "Ghostwriter Draft";

  return {
    essay: ctx.essay || "",
    bibliography: ctx.bibliography || "",
    finalEssayTitle,
    studentName: ctx.formatAnswers.studentName || "",
    instructorName: ctx.formatAnswers.instructorName || "",
    institutionName: ctx.formatAnswers.institutionName || "",
    courseInfo: ctx.formatAnswers.courseInfo || "",
    subjectCode: ctx.formatAnswers.subjectCode || "",
    essayDate: ctx.formatAnswers.essayDate || "",
  };
}

function toPages(formatted: FormatterOutput, citationStyle: string): ExportPageSnapshot[] {
  const fallbackPage: FormatterPage = {
    content: formatted.content,
    textAlign: "left",
    showPageNumber: formatted.profile.showPageNumber,
    lineHeight: formatted.profile.lineHeight,
  };

  const pages = formatted.pages && formatted.pages.length > 0 ? formatted.pages : [fallbackPage];
  return pages.map((page, index) => ({
    id: index + 1,
    title: index === 0 ? (citationStyle === "None" ? "Essay" : "Formatted Essay") : `Page ${index + 1}`,
    html: normalizeHtmlFromContent(page.content),
    plainText: page.content.trim(),
    textAlign: page.textAlign || "left",
    centerVertically: page.centerVertically,
    showPageNumber: page.showPageNumber ?? formatted.profile.showPageNumber,
    lineHeight: page.lineHeight || formatted.profile.lineHeight,
  }));
}

export function buildExportDocumentSnapshot(ctx: AgentContext): ExportDocumentSnapshot {
  const citationStyle = ctx.draftSettings.citationStyle || "None";
  const formatted = FormatterService.getFormatter(citationStyle).format(buildFormatterInput(ctx));
  const finalEssayTitle =
    ctx.formatAnswers.finalEssayTitle?.trim() || ctx.essayTopic || "Ghostwriter Draft";

  return {
    title: finalEssayTitle,
    pages: toPages(formatted, citationStyle),
    profile: {
      defaultFont: formatted.profile.defaultFont,
      lineHeight: formatted.profile.lineHeight,
      marginInch: formatted.profile.marginInch,
      headerText: formatted.profile.headerText,
      showPageNumber: formatted.profile.showPageNumber,
      pageNumberStartPage: formatted.profile.pageNumberStartPage || 1,
      pageNumberStartNumber: formatted.profile.pageNumberStartNumber || 1,
    },
    generatedAt: new Date().toISOString(),
  };
}
