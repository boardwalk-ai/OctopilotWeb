import { EssayFormatter, FormatterInput, FormatterOutput } from "./FormatterTypes";
import { apaAbstractPageHtml, composePages, getDate, getTitle, paragraphHtml, paragraphsHtml, referencesHtml, spacerHtml } from "./FormatterUtils";

export class APAFormatterService implements EssayFormatter {
    format(input: FormatterInput): FormatterOutput {
        // APA 7th (student paper): title 3–4 double-spaced lines below the top
        // margin, bold, then ONE blank line before the author block. The page
        // is NOT vertically centered.
        const titleLine = paragraphHtml(getTitle(input), {
            align: "center", bold: true, marginBottomEm: 0, dataField: "essayTitle",
        });
        const infoLines: Array<[string, string]> = [
            [input.studentName?.trim() || "Student Name", "studentName"],
            [input.institutionName?.trim() || "Institution Name", "institutionName"],
            [input.courseInfo?.trim() || "Course Name", "courseInfo"],
            [input.instructorName?.trim() || "Instructor Name", "instructorName"],
            [getDate(input), "essayDate"],
        ];
        const titlePage = [
            spacerHtml(3),
            titleLine,
            spacerHtml(1),
            ...infoLines.map(([text, field]) => paragraphHtml(text, {
                align: "center", marginBottomEm: 0, dataField: field,
            })),
        ].join("");

        // APA 7th: Abstract is page 2
        const abstractPage = apaAbstractPageHtml(input.abstract, input.keywords);

        // Body: title repeated (bold, centered), then uniformly double-spaced
        // paragraphs with 0.5in first-line indent — no extra space between them.
        const bodyPage = [
            paragraphHtml(getTitle(input), {
                align: "center",
                bold: true,
                marginBottomEm: 0,
                dataField: "essayTitle",
            }),
            paragraphsHtml(input.essay, {
                align: "left",
                indentFirstLine: true,
                marginBottomEm: 0,
                dataField: "essay",
            }),
        ].join("");

        // References: bold centered heading, hanging indent, alphabetized,
        // double-spaced with no extra space between entries.
        const referencesPage = referencesHtml("References", input.bibliography, {
            headingBold: true,
            hangingIndent: true,
            alwaysShow: true,
            sortAlphabetically: true,
            entrySpacingEm: 0,
        });

        const pages = [
            {
                content: titlePage,
                textAlign: "center" as const,
                showPageNumber: true,
                lineHeight: 2,
            },
            {
                content: abstractPage,
                textAlign: "left" as const,
                showPageNumber: true,
                lineHeight: 2,
            },
            {
                content: bodyPage,
                textAlign: "left" as const,
                showPageNumber: true,
                lineHeight: 2,
            },
            {
                content: referencesPage,
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
                headerText: "",
                pageNumberStartPage: 1,
                pageNumberStartNumber: 1,
                firstLineIndentInch: 0.5,
            },
        };
    }
}
