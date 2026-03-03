import { OrganizerState } from "./OrganizerService";
import { EssayFormatter, FormatterInput, FormatterOutput } from "./FormatterTypes";
import { NullFormatterService } from "./NullFormatterService";
import { APAFormatterService } from "./APAFormatterService";
import { MLAFormatterService } from "./MLAFormatterService";
import { IEEEFormatterService } from "./IEEEFormatterService";
import { HavardFormatterService } from "./HavardFormatterService";
import { ChicagoFormatterService } from "./ChicagoFormatterService";

const FALLBACK_FORMATTER = new NullFormatterService();

const FORMATTERS: Record<string, EssayFormatter> = {
    none: new NullFormatterService(),
    apa: new APAFormatterService(),
    mla: new MLAFormatterService(),
    ieee: new IEEEFormatterService(),
    havard: new HavardFormatterService(),
    harvard: new HavardFormatterService(),
    chicago: new ChicagoFormatterService(),
};

export class FormatterService {
    static getFormatter(style?: string): EssayFormatter {
        const key = (style || "none").trim().toLowerCase();
        return FORMATTERS[key] || FALLBACK_FORMATTER;
    }

    static formatFromOrganizer(org: OrganizerState): FormatterOutput {
        const input: FormatterInput = {
            essay: org.generatedEssay || "",
            bibliography: org.generatedBibliography || "",
            finalEssayTitle: org.finalEssayTitle,
            studentName: org.studentName,
            instructorName: org.instructorName,
            institutionName: org.institutionName,
            courseInfo: org.courseInfo,
            subjectCode: org.subjectCode,
            essayDate: org.essayDate,
        };

        const formatter = this.getFormatter(org.citationStyle);
        return formatter.format(input);
    }
}
