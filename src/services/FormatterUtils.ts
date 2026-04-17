import { FormatterInput } from "./FormatterTypes";

export const PAGE_BREAK = "\f";

export function escapeHtml(text: string): string {
    return (text || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// Escapes text while wrapping any http(s) URLs in an <a> tag so reference
// links render as visible hyperlinks (blue + underline).
export function escapeAndLinkify(text: string): string {
    const raw = text || "";
    const urlRegex = /(https?:\/\/[^\s<>"']+)/g;
    const out: string[] = [];
    let last = 0;
    let match: RegExpExecArray | null;
    while ((match = urlRegex.exec(raw)) !== null) {
        if (match.index > last) out.push(escapeHtml(raw.slice(last, match.index)));
        // Trim common trailing punctuation that shouldn't be part of the URL.
        let url = match[0];
        let trail = "";
        while (url && /[.,;:!?)\]]/.test(url[url.length - 1])) {
            trail = url[url.length - 1] + trail;
            url = url.slice(0, -1);
        }
        const href = escapeHtml(url);
        out.push(`<a href="${href}" target="_blank" rel="noreferrer" style="color:#1d4ed8;text-decoration:underline;word-break:break-all;">${href}</a>`);
        if (trail) out.push(escapeHtml(trail));
        last = match.index + match[0].length;
    }
    if (last < raw.length) out.push(escapeHtml(raw.slice(last)));
    return out.join("");
}

export function normalizeText(text: string): string {
    return (text || "").replace(/\r\n?/g, "\n").trim();
}

export function getTitle(input: FormatterInput): string {
    return input.finalEssayTitle?.trim() || "Untitled Paper";
}

export function getDate(input: FormatterInput): string {
    return input.essayDate?.trim() || new Date().toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
    });
}

export function splitParagraphs(text: string): string[] {
    return normalizeText(text)
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean);
}

export function getDateDayMonthYear(input: FormatterInput): string {
    const fallback = getDate(input);
    const source = normalizeText(input.essayDate || "");
    if (!source) return fallback;
    const parsed = new Date(source);
    if (Number.isNaN(parsed.getTime())) return fallback;
    const day = parsed.getDate();
    const month = parsed.toLocaleString("en-US", { month: "long" });
    const year = parsed.getFullYear();
    return `${day} ${month} ${year}`;
}

export function indentParagraphs(text: string, indent = true): string {
    const paragraphs = splitParagraphs(text);
    return paragraphs
        .map((p) => (indent ? `\t${p}` : p))
        .join("\n\n");
}

export function paragraphHtml(
    text: string,
    opts?: {
        align?: "left" | "center" | "right" | "justify";
        indentFirstLine?: boolean;
        bold?: boolean;
        marginBottomEm?: number;
    }
): string {
    const align = opts?.align || "left";
    const indent = opts?.indentFirstLine ? "text-indent:0.5in;" : "";
    const weight = opts?.bold ? "font-weight:700;" : "";
    const margin = `margin:0 0 ${opts?.marginBottomEm ?? 1}em 0;`;
    return `<p style="${margin}text-align:${align};${indent}${weight}">${escapeHtml(text)}</p>`;
}

export function paragraphsHtml(
    text: string,
    opts?: {
        align?: "left" | "center" | "right" | "justify";
        indentFirstLine?: boolean;
        marginBottomEm?: number;
    }
): string {
    const paragraphs = splitParagraphs(text);
    if (!paragraphs.length) return "<p><br/></p>";
    return paragraphs
        .map((p) => paragraphHtml(p, {
            align: opts?.align,
            indentFirstLine: opts?.indentFirstLine,
            marginBottomEm: opts?.marginBottomEm,
        }))
        .join("");
}

export function centeredTitlePageHtml(
    lines: string[],
    opts?: {
        boldFirstLine?: boolean;
        lineGapEm?: number;
    }
): string {
    const gap = opts?.lineGapEm ?? 1;
    return lines
        .filter((line) => normalizeText(line).length > 0)
        .map((line, index) => paragraphHtml(line, {
            align: "center",
            bold: Boolean(opts?.boldFirstLine && index === 0),
            marginBottomEm: gap,
        }))
        .join("");
}

export function referencesHtml(
    title: string,
    bibliography: string | undefined,
    opts?: {
        numbered?: boolean;
        hangingIndent?: boolean;
        headingBold?: boolean;
    }
): string {
    const entries = normalizeText(bibliography || "")
        .split(/\n+/)
        .map((entry) => entry.trim())
        .filter(Boolean);

    const normalizedTitle = title.toLowerCase().replace(/[\s:]+/g, " ").trim();
    const headingAliases = new Set([
        normalizedTitle,
        "references",
        "reference",
        "reference list",
        "works cited",
        "bibliography",
    ]);
    if (entries.length > 0) {
        const first = entries[0].toLowerCase().replace(/[\s:]+/g, " ").trim();
        if (headingAliases.has(first)) entries.shift();
    }

    if (!entries.length) return "";

    const heading = `<p data-keep-with-next="1" data-reference-heading="1" style="margin:0 0 1.8em 0;text-align:center;${opts?.headingBold ? "font-weight:700;" : ""}">${escapeHtml(title)}</p>`;

    const body = entries
        .map((entry, index) => {
            const numbered = opts?.numbered ? `[${index + 1}] ${entry.replace(/^\[\d+\]\s*/, "")}` : entry;
            const hanging = opts?.hangingIndent !== false ? "padding-left:0.5in;text-indent:-0.5in;" : "";
            return `<p style="margin:0 0 1em 0;${hanging}">${escapeAndLinkify(numbered)}</p>`;
        })
        .join("");

    return `${heading}${body}`;
}

export function appendBibliography(sectionTitle: string, bibliography?: string): string {
    const bib = normalizeText(bibliography || "");
    if (!bib) return "";
    return `${sectionTitle}\n${bib}`;
}

export function getLastName(fullName?: string): string {
    const source = (fullName || "").trim();
    if (!source) return "Student";
    const parts = source.split(/\s+/).filter(Boolean);
    return parts[parts.length - 1] || "Student";
}

export function composeSections(sections: Array<string | undefined>): string {
    return sections.map((s) => normalizeText(s || "")).filter(Boolean).join("\n\n");
}

export function composePages(pages: Array<string | undefined>): string {
    return pages
        .map((p) => normalizeText(p || ""))
        .filter(Boolean)
        .join(PAGE_BREAK);
}
