import { SourceData } from "./OrganizerService";

function getYear(source: SourceData): string {
    const year = (source.publishedYear || "").match(/\d{4}/)?.[0];
    return year || "n.d.";
}

function getFirstAuthorChunk(author?: string): string {
    const src = (author || "").trim();
    if (!src) return "Unknown";
    return src.split(/;| and |&|,/i).map((part) => part.trim()).find(Boolean) || "Unknown";
}

function getSurname(author?: string): string {
    const first = getFirstAuthorChunk(author);
    if (first.includes(",")) {
        return first.split(",")[0].trim() || "Unknown";
    }
    const tokens = first.split(/\s+/).filter(Boolean);
    return tokens[tokens.length - 1] || "Unknown";
}

function cleanTitle(source: SourceData): string {
    return source.title?.trim() || "Untitled Source";
}

function cleanPublisher(source: SourceData): string {
    return source.publisher?.trim() || "Unknown Publisher";
}

function cleanUrl(source: SourceData): string {
    return source.url?.trim() || "";
}

export class CitationTemplateService {
    static formatInText(style: string, source: SourceData, index: number): string {
        const mode = (style || "none").trim().toLowerCase();
        const surname = getSurname(source.author);
        const year = getYear(source);

        if (mode === "ieee") return `[${index}]`;
        if (mode === "mla") return `(${surname})`;
        if (mode === "chicago") return `(${surname} ${year})`;
        if (mode === "harvard" || mode === "havard") return `(${surname}, ${year})`;
        if (mode === "apa") return `(${surname}, ${year})`;
        return "";
    }

    static formatReference(style: string, source: SourceData, index: number): string {
        const mode = (style || "none").trim().toLowerCase();
        const author = source.author?.trim() || "Unknown";
        const surname = getSurname(source.author);
        const year = getYear(source);
        const title = cleanTitle(source);
        const publisher = cleanPublisher(source);
        const url = cleanUrl(source);

        if (mode === "none") {
            return `${author}. ${title}.${url ? ` ${url}` : ""}`.trim();
        }
        if (mode === "ieee") {
            return `[${index}] ${author}, "${title}," ${publisher}, ${year}.${url ? ` [Online]. Available: ${url}` : ""}`.trim();
        }
        if (mode === "mla") {
            return `${author}. "${title}." ${publisher}, ${year}.${url ? ` ${url}.` : ""}`.trim();
        }
        if (mode === "chicago") {
            return `${author}. "${title}." ${publisher}, ${year}.${url ? ` ${url}.` : ""}`.trim();
        }
        if (mode === "harvard" || mode === "havard") {
            return `${surname}, ${year}. ${title}. ${publisher}.${url ? ` Available at: ${url}` : ""}`.trim();
        }
        // APA default
        return `${surname}. (${year}). ${title}. ${publisher}.${url ? ` ${url}` : ""}`.trim();
    }
}
