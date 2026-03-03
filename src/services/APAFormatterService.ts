import { EssayFormatter, FormatterInput, FormatterOutput } from "./FormatterTypes";
import { centeredTitlePageHtml, composePages, getDate, getTitle, paragraphHtml, paragraphsHtml, referencesHtml } from "./FormatterUtils";

export class APAFormatterService implements EssayFormatter {
    format(input: FormatterInput): FormatterOutput {
        const titlePageLines = [
            getTitle(input),
            input.studentName?.trim() || "Student Name",
            input.institutionName?.trim() || "Institution Name",
            input.courseInfo?.trim() || "Course Name",
            input.instructorName?.trim() || "Instructor Name",
            getDate(input),
        ];

        const titlePage = centeredTitlePageHtml(titlePageLines, {
            boldFirstLine: true,
            lineGapEm: 1.25,
        });

        const bodyPage = [
            paragraphHtml(getTitle(input), {
                align: "center",
                bold: true,
                marginBottomEm: 1.8,
            }),
            paragraphsHtml(input.essay, {
                align: "left",
                indentFirstLine: true,
                marginBottomEm: 1.2,
            }),
        ].join("");

        const referencesPage = referencesHtml("References", input.bibliography, {
            headingBold: true,
            hangingIndent: true,
        });

        const pages = [
            {
                content: titlePage,
                textAlign: "center" as const,
                centerVertically: true,
                showPageNumber: true,
                lineHeight: 2,
            },
            {
                content: bodyPage,
                textAlign: "left" as const,
                showPageNumber: true,
                lineHeight: 2,
            },
            ...(referencesPage ? [{
                content: referencesPage,
                textAlign: "left" as const,
                showPageNumber: true,
                lineHeight: 2,
            }] : []),
        ];

        return {
            content: composePages(pages.map((p) => p.content)),
            pages,
            profile: {
                defaultFont: "Times New Roman",
                lineHeight: 2,
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
