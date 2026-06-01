export interface FormatterInput {
    essay: string;
    bibliography?: string;
    finalEssayTitle?: string;
    studentName?: string;
    instructorName?: string;
    institutionName?: string;
    courseInfo?: string;
    subjectCode?: string;
    essayDate?: string;
    abstract?: string;      // APA: abstract page content
    keywords?: string;      // APA: keywords line below abstract
}

export interface FormatterProfile {
    defaultFont: string;
    defaultFontSize?: number;   // pt — defaults to 12 if omitted
    lineHeight: number;
    marginInch: number;
    showPageNumber: boolean;
    headerText: string;
    pageNumberStartPage?: number;
    pageNumberStartNumber?: number;
    firstLineIndentInch?: number;
}

export interface FormatterPage {
    content: string;
    textAlign?: "left" | "center" | "right" | "justify";
    centerVertically?: boolean;
    showPageNumber?: boolean;
    lineHeight?: number;
}

export interface FormatterOutput {
    content: string;
    profile: FormatterProfile;
    pages?: FormatterPage[];
}

export interface EssayFormatter {
    format(input: FormatterInput): FormatterOutput;
}
