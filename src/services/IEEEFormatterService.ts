import { EssayFormatter, FormatterInput, FormatterOutput } from "./FormatterTypes";
import { composePages, getDate, getTitle, paragraphHtml, paragraphsHtml, referencesHtml } from "./FormatterUtils";

export class IEEEFormatterService implements EssayFormatter {
    format(input: FormatterInput): FormatterOutput {
        const headerBlock = [
            paragraphHtml(getTitle(input), {
                align: "center", bold: true, marginBottomEm: 1.2,
                dataField: "essayTitle",
            }),
            paragraphHtml(input.studentName?.trim() || "Author", {
                align: "center", marginBottomEm: 0.5,
                dataField: "studentName",
            }),
            paragraphHtml(input.institutionName?.trim() || "Institution", {
                align: "center", marginBottomEm: 0.5,
                dataField: "institutionName",
            }),
            paragraphHtml(getDate(input), {
                align: "center", marginBottomEm: 1.2,
                dataField: "essayDate",
            }),
        ].join("");

        const firstPage = [
            headerBlock,
            paragraphsHtml(input.essay, {
                align: "left",
                indentFirstLine: false,
                marginBottomEm: 0.9,
                dataField: "essay",
            }),
        ].join("");

        // IEEE: references numbered in order of citation — never alphabetized
        const referencesPage = referencesHtml("References", input.bibliography, {
            numbered: true,
            headingBold: true,
            hangingIndent: false,
            alwaysShow: true,
            entrySpacingEm: 0.8,
            headingGapEm: 1,
        });

        const pages = [
            {
                content: firstPage,
                textAlign: "left" as const,
                showPageNumber: false,
                lineHeight: 1.15,
            },
            {
                content: referencesPage,
                textAlign: "left" as const,
                showPageNumber: false,
                lineHeight: 1.15,
            },
        ];

        return {
            content: composePages(pages.map((p) => p.content)),
            pages,
            profile: {
                defaultFont: "Times New Roman",
                defaultFontSize: 10,
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
