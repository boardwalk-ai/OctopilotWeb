import { EssayFormatter, FormatterInput, FormatterOutput } from "./FormatterTypes";
import { centeredTitlePageHtml, composePages, getDate, getTitle, paragraphHtml, paragraphsHtml, referencesHtml } from "./FormatterUtils";

export class HavardFormatterService implements EssayFormatter {
    format(input: FormatterInput): FormatterOutput {
        const titlePage = centeredTitlePageHtml([
            getTitle(input),
            input.studentName?.trim() || "Student Name",
            input.institutionName?.trim() || "Institution Name",
            input.courseInfo?.trim() || "Course Information",
            input.instructorName?.trim() || "Instructor Name",
            getDate(input),
        ], {
            boldFirstLine: true,
            lineGapEm: 1.2,
        });

        const bodyPage = [
            paragraphHtml(getTitle(input), {
                align: "center",
                bold: true,
                marginBottomEm: 1.6,
            }),
            paragraphsHtml(input.essay, {
                align: "left",
                indentFirstLine: true,
                marginBottomEm: 1.1,
            }),
        ].join("");

        const referencesPage = referencesHtml("Reference List", input.bibliography, {
            headingBold: true,
            hangingIndent: true,
        });

        const pages = [
            {
                content: titlePage,
                textAlign: "center" as const,
                centerVertically: true,
                showPageNumber: true,
                lineHeight: 1.5,
            },
            {
                content: bodyPage,
                textAlign: "left" as const,
                showPageNumber: true,
                lineHeight: 1.5,
            },
            ...(referencesPage ? [{
                content: referencesPage,
                textAlign: "left" as const,
                showPageNumber: true,
                lineHeight: 1.5,
            }] : []),
        ];

        return {
            content: composePages(pages.map((p) => p.content)),
            pages,
            profile: {
                defaultFont: "Times New Roman",
                lineHeight: 1.5,
                marginInch: 1,
                showPageNumber: true,
                headerText: "",
                pageNumberStartPage: 1,
                pageNumberStartNumber: 1,
                firstLineIndentInch: 0.5,
            },
        };
    }
}
