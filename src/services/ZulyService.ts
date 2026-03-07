import { Organizer, SourceData, CompactedSource } from "./OrganizerService";
import { TestService } from "./TestService";

type CompactionInput = {
    sourceTitle: string;
    fullContent: string;
    sourceType: "search" | "pdf" | "image" | "fieldwork" | "manual";
};

export class ZulyService {
    static async compactSource(source: SourceData, sourceIndex: number): Promise<CompactedSource> {
        const compactionInput = ZulyService.buildCompactionInput(source);
        const res = await fetch("/api/zuly/compact", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                fullContent: compactionInput.fullContent,
                sourceTitle: compactionInput.sourceTitle,
                sourceType: compactionInput.sourceType,
            }),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `Zuly compact failed: ${res.status}`);
        }

        const result = await res.json();

        return {
            sourceIndex,
            url: source.url,
            kind: compactionInput.sourceType,
            title: source.title,
            author: source.author,
            publishedYear: source.publishedYear,
            publisher: source.publisher,
            compactedContent: result.compacted_content || "",
        };
    }

    static buildCompactionInput(source: SourceData): CompactionInput {
        if (source.manualSourceType === "pdf") {
            const pageRange = source.pdfMeta ? `${source.pdfMeta.startPage}-${source.pdfMeta.endPage}` : "Unknown";
            const pageText = source.pdfMeta?.pages?.slice(
                Math.max(0, (source.pdfMeta.startPage || 1) - 1),
                source.pdfMeta?.endPage || source.pdfMeta?.pages?.length || undefined
            ).join("\n\n") || source.fullContent || "";

            return {
                sourceTitle: source.pdfMeta?.documentTitle || source.title || "PDF Source",
                sourceType: "pdf",
                fullContent: [
                    "Source Type: PDF excerpt",
                    `Document Title: ${source.pdfMeta?.documentTitle || source.title || "Unknown"}`,
                    `Author(s): ${source.author || "Unknown"}`,
                    `Publication Year: ${source.pdfMeta?.publicationYear || source.publishedYear || "Unknown"}`,
                    `Publisher / Journal: ${source.pdfMeta?.journalName || source.pdfMeta?.publisher || source.publisher || "Unknown"}`,
                    `Selected Pages: ${pageRange}`,
                    "Selected Text:",
                    pageText,
                ].join("\n"),
            };
        }

        if (source.manualSourceType === "image") {
            return {
                sourceTitle: source.imageMeta?.sourceLabel || source.title || "Image OCR Source",
                sourceType: "image",
                fullContent: [
                    "Source Type: Image OCR source",
                    `Source Label: ${source.imageMeta?.sourceLabel || source.title || "Unknown"}`,
                    `Citation Type: ${source.imageMeta?.citationKind || "Unknown"}`,
                    `Image Count: ${source.imageMeta?.imageCount || 0}`,
                    `Author / Contributor: ${source.author || "Unknown"}`,
                    `Publication Year: ${source.publishedYear || "Unknown"}`,
                    "Confirmed OCR Text:",
                    source.imageMeta?.finalSnippet || source.fullContent || "",
                ].join("\n"),
            };
        }

        if (source.manualSourceType === "fieldwork" && source.fieldworkMeta) {
            const customFieldLines = Object.entries(source.fieldworkMeta.customFields || {})
                .filter(([, value]) => Boolean((value || "").trim()))
                .map(([key, value]) => `${key}: ${value}`);

            return {
                sourceTitle: source.fieldworkMeta.title || source.title || "Fieldwork Entry",
                sourceType: "fieldwork",
                fullContent: [
                    "Source Type: Primary fieldwork entry",
                    `Research Type: ${source.fieldworkMeta.researchType || "Unknown"}`,
                    `Title / Topic: ${source.fieldworkMeta.title || source.title || "Unknown"}`,
                    `Date Conducted: ${source.fieldworkMeta.dateConducted || source.publishedYear || "Unknown"}`,
                    `Researcher / Recorder: ${source.fieldworkMeta.researcherName || source.author || "Unknown"}`,
                    `Location: ${source.fieldworkMeta.location || "Unknown"}`,
                    `Participants / Subjects: ${source.fieldworkMeta.participants || "Unknown"}`,
                    ...customFieldLines,
                    "Method Summary:",
                    source.fieldworkMeta.methodSummary || "",
                    "Key Findings:",
                    source.fieldworkMeta.keyFindings || "",
                    "Notes:",
                    source.fieldworkMeta.notes || "",
                ].join("\n"),
            };
        }

        return {
            sourceTitle: source.title || "Source",
            sourceType: source.manualSourceType === "url" || !source.manualSourceType ? "search" : "manual",
            fullContent: [
                source.manualSourceType ? `Source Type: ${source.manualSourceType}` : "Source Type: Search / web source",
                source.fullContent || "",
            ].join("\n\n"),
        };
    }

    /**
     * Run Zuly on all scraped sources in the background.
     * Updates Organizer.compactedSources as each completes.
     */
    static async compactAllSources(): Promise<void> {
        if (TestService.isActive) {
            Organizer.set({
                compactedSources: [{
                    sourceIndex: 0,
                    url: "mock-url",
                    kind: "search",
                    title: "Mock Compacted",
                    author: "Tester",
                    publishedYear: "2026",
                    publisher: "Test Mode",
                    compactedContent: "This is a mock compacted source content."
                }]
            });
            return;
        }

        const state = Organizer.get();
        const scrapedSources = state.manualSources
            .map((s, i) => ({ source: s, index: i }))
            .filter(({ source }) => source.status === "scraped" && source.fullContent);

        if (scrapedSources.length === 0) {
            console.log("[Zuly] No scraped sources to compact.");
            return;
        }

        console.log(`[Zuly] Compacting ${scrapedSources.length} sources...`);

        const results: CompactedSource[] = [];

        // Process sources one at a time to avoid rate limits
        for (const { source, index } of scrapedSources) {
            try {
                console.log(`[Zuly] Compacting source ${index}: ${source.title || source.url}`);
                const compacted = await ZulyService.compactSource(source, index);
                results.push(compacted);

                // Update Organizer progressively
                Organizer.set({ compactedSources: [...results] });
            } catch (err) {
                console.error(`[Zuly] Failed to compact source ${index}:`, err);
            }
        }

        console.log(`[Zuly] Done. Compacted ${results.length}/${scrapedSources.length} sources.`);
    }
}
