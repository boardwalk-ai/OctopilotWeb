import { EssayFormatter, FormatterInput, FormatterOutput } from "./FormatterTypes";
import { composePages, getDate, getTitle, paragraphHtml, paragraphsHtml, referencesHtml, spacerHtml } from "./FormatterUtils";

export class ChicagoFormatterService implements EssayFormatter {
    format(input: FormatterInput): FormatterOutput {
        // Turabian 9th title page: title about a third of the way down the
        // page; author/course/instructor/date block about two-thirds down.
        // Not vertically centered, no page number on the title page.
        const titlePage = [
            spacerHtml(7),
            paragraphHtml(getTitle(input), {
                align: "center", marginBottomEm: 0, dataField: "essayTitle",
            }),
            spacerHtml(6),
            paragraphHtml(input.studentName?.trim() || "Student Name", {
                align: "center", marginBottomEm: 0, dataField: "studentName",
            }),
            paragraphHtml(input.courseInfo?.trim() || "Course Information", {
                align: "center", marginBottomEm: 0, dataField: "courseInfo",
            }),
            paragraphHtml(input.instructorName?.trim() || "Instructor Name", {
                align: "center", marginBottomEm: 0, dataField: "instructorName",
            }),
            paragraphHtml(getDate(input), {
                align: "center", marginBottomEm: 0, dataField: "essayDate",
            }),
        ].join("");

        const bodyPage = paragraphsHtml(input.essay, {
            align: "left",
            indentFirstLine: true,
            marginBottomEm: 0,
            dataField: "essay",
            html: input.essayIsHtml,
        });

        // Turabian: "Bibliography" heading bold centered; entries single-spaced
        // internally with a blank line between entries; hanging indent; A→Z.
        const bibliographyPage = referencesHtml("Bibliography", input.bibliography, {
            headingBold: true,
            hangingIndent: true,
            alwaysShow: true,
            sortAlphabetically: true,
            entrySpacingEm: 1,
            headingGapEm: 1,
            html: input.bibliographyIsHtml,
        });

        const pages = [
            {
                content: titlePage,
                textAlign: "center" as const,
                showPageNumber: false,
                lineHeight: 2,
            },
            {
                content: bodyPage,
                textAlign: "left" as const,
                showPageNumber: true,
                lineHeight: 2,
            },
            {
                content: bibliographyPage,
                textAlign: "left" as const,
                showPageNumber: true,
                lineHeight: 1.15,
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
                pageNumberStartPage: 2,
                pageNumberStartNumber: 1,
                firstLineIndentInch: 0.5,
            },
        };
    }
}
