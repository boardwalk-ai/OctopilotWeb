import { EssayFormatter, FormatterInput, FormatterOutput } from "./FormatterTypes";
import { composePages, getDateDayMonthYear, getLastName, getTitle, paragraphHtml, paragraphsHtml, referencesHtml } from "./FormatterUtils";

export class MLAFormatterService implements EssayFormatter {
    format(input: FormatterInput): FormatterOutput {
        const headingLines = [
            input.studentName?.trim() || "Student Name",
            input.instructorName?.trim() || "Instructor Name",
            input.courseInfo?.trim() || input.subjectCode?.trim() || "Course Information",
            getDateDayMonthYear(input),
        ];

        const firstPage = [
            ...headingLines.map((line) => paragraphHtml(line, { align: "left", marginBottomEm: 0.8 })),
            paragraphHtml(getTitle(input), { align: "center", marginBottomEm: 1.4 }),
            paragraphsHtml(input.essay, {
                align: "left",
                indentFirstLine: true,
                marginBottomEm: 1.2,
            }),
        ].join("");

        const worksCitedPage = referencesHtml("Works Cited", input.bibliography, {
            headingBold: false,
            hangingIndent: true,
        });
        const lastName = getLastName(input.studentName);

        const pages = [
            {
                content: firstPage,
                textAlign: "left" as const,
                showPageNumber: true,
                lineHeight: 2,
            },
            ...(worksCitedPage ? [{
                content: worksCitedPage,
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
                headerText: lastName,
                pageNumberStartPage: 1,
                pageNumberStartNumber: 1,
                firstLineIndentInch: 0.5,
            },
        };
    }
}
