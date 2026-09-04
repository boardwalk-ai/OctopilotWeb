import { EssayFormatter, FormatterInput, FormatterOutput } from "./FormatterTypes";
import { composePages, getDateDayMonthYear, getLastName, getTitle, paragraphHtml, paragraphsHtml, referencesHtml } from "./FormatterUtils";

export class MLAFormatterService implements EssayFormatter {
    format(input: FormatterInput): FormatterOutput {
        // MLA 9th: everything uniformly double-spaced — no extra space between
        // the heading block, title, or paragraphs. Date as "12 June 2026".
        const MLA_FIELDS = ["studentName", "instructorName", "courseInfo", "essayDate"] as const;
        const headingLines = [
            input.studentName?.trim() || "Student Name",
            input.instructorName?.trim() || "Instructor Name",
            input.courseInfo?.trim() || input.subjectCode?.trim() || "Course Information",
            getDateDayMonthYear(input),
        ];

        const firstPage = [
            ...headingLines.map((line, i) => paragraphHtml(line, {
                align: "left",
                marginBottomEm: 0,
                dataField: MLA_FIELDS[i],
            })),
            // Title: centered, NOT bold, same double spacing as everything else
            paragraphHtml(getTitle(input), { align: "center", marginBottomEm: 0, dataField: "essayTitle" }),
            paragraphsHtml(input.essay, {
                align: "left",
                indentFirstLine: true,
                marginBottomEm: 0,
                dataField: "essay",
                html: input.essayIsHtml,
            }),
        ].join("");

        // Works Cited: heading centered not bold, alphabetized, hanging indent,
        // double-spaced with no extra space between entries.
        const worksCitedPage = referencesHtml("Works Cited", input.bibliography, {
            headingBold: false,
            hangingIndent: true,
            alwaysShow: true,
            sortAlphabetically: true,
            entrySpacingEm: 0,
            html: input.bibliographyIsHtml,
        });
        const lastName = getLastName(input.studentName);

        const pages = [
            {
                content: firstPage,
                textAlign: "left" as const,
                showPageNumber: true,
                lineHeight: 2,
            },
            {
                content: worksCitedPage,
                textAlign: "left" as const,
                showPageNumber: true,
                lineHeight: 2,
            },
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
