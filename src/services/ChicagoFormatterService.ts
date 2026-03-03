import { EssayFormatter, FormatterInput, FormatterOutput } from "./FormatterTypes";
import { centeredTitlePageHtml, composePages, getDate, getTitle, paragraphsHtml, referencesHtml } from "./FormatterUtils";

export class ChicagoFormatterService implements EssayFormatter {
    format(input: FormatterInput): FormatterOutput {
        const titlePage = centeredTitlePageHtml([
            getTitle(input),
            input.studentName?.trim() || "Student Name",
            input.courseInfo?.trim() || "Course Information",
            input.instructorName?.trim() || "Instructor Name",
            getDate(input),
        ], {
            boldFirstLine: false,
            lineGapEm: 1.3,
        });

        const bodyPage = paragraphsHtml(input.essay, {
            align: "left",
            indentFirstLine: true,
            marginBottomEm: 1.1,
        });
        const bibliographyPage = referencesHtml("Bibliography", input.bibliography, {
            headingBold: false,
            hangingIndent: true,
        });

        const pages = [
            {
                content: titlePage,
                textAlign: "center" as const,
                centerVertically: true,
                showPageNumber: false,
                lineHeight: 2,
            },
            {
                content: bodyPage,
                textAlign: "left" as const,
                showPageNumber: true,
                lineHeight: 2,
            },
            ...(bibliographyPage ? [{
                content: bibliographyPage,
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
                pageNumberStartPage: 2,
                pageNumberStartNumber: 1,
                firstLineIndentInch: 0.5,
            },
        };
    }
}
