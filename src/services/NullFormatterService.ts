import { EssayFormatter, FormatterInput, FormatterOutput } from "./FormatterTypes";
import { normalizeText } from "./FormatterUtils";

export class NullFormatterService implements EssayFormatter {
    format(input: FormatterInput): FormatterOutput {
        const content = normalizeText(input.essay);
        return {
            content,
            pages: [{
                content,
                textAlign: "left",
                showPageNumber: false,
                lineHeight: 1.5,
            }],
            profile: {
                defaultFont: "Arial",
                lineHeight: 1.5,
                marginInch: 0.5,
                showPageNumber: false,
                headerText: "",
                pageNumberStartPage: 1,
                pageNumberStartNumber: 1,
                firstLineIndentInch: 0.5,
            },
        };
    }
}
