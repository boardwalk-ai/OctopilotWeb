import { EssayFormatter, FormatterInput, FormatterOutput } from "./FormatterTypes";
import { composePages, getDate, getTitle, paragraphHtml, paragraphsHtml, referencesHtml } from "./FormatterUtils";

export class IEEEFormatterService implements EssayFormatter {
    format(input: FormatterInput): FormatterOutput {
        const headerBlock = [
            paragraphHtml(getTitle(input), {
                align: "center",
                bold: true,
                marginBottomEm: 1.2,
            }),
            paragraphHtml(input.studentName?.trim() || "Author", {
                align: "center",
                marginBottomEm: 0.5,
            }),
            paragraphHtml(input.institutionName?.trim() || "Institution", {
                align: "center",
                marginBottomEm: 0.5,
            }),
            paragraphHtml(getDate(input), {
                align: "center",
                marginBottomEm: 1.2,
            }),
        ].join("");

        const firstPage = [
            headerBlock,
            paragraphsHtml(input.essay, {
                align: "left",
                indentFirstLine: false,
                marginBottomEm: 0.9,
            }),
        ].join("");

        const referencesPage = referencesHtml("References", input.bibliography, {
            numbered: true,
            headingBold: true,
            hangingIndent: false,
        });

        const pages = [
            {
                content: firstPage,
                textAlign: "left" as const,
                showPageNumber: false,
                lineHeight: 1.15,
            },
            ...(referencesPage ? [{
                content: referencesPage,
                textAlign: "left" as const,
                showPageNumber: false,
                lineHeight: 1.15,
            }] : []),
        ];

        return {
            content: composePages(pages.map((p) => p.content)),
            pages,
            profile: {
                defaultFont: "Times New Roman",
                lineHeight: 1.15,
                marginInch: 1,
                showPageNumber: false,
                headerText: "",
                pageNumberStartPage: 1,
                pageNumberStartNumber: 1,
                firstLineIndentInch: 0,
            },
        };
    }
}
