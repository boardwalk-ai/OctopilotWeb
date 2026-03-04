import { SourceData } from "./OrganizerService";
import { TestService } from "./TestService";

interface BackendKeyResponse {
    openrouter_api_key: string;
    secondary_model: string;
}

interface SuAssistResponse {
    bullets?: string[];
    answer?: string;
    inTextCitation?: Array<{ index: number; citation: string }>;
    done?: string[];
    suggestions?: string[];
}

interface MoreIdeasInput {
    essayTopic: string;
    sectionType: string;
    sectionTitle: string;
    currentDraft?: string;
    citationStyle?: string;
}

interface AskInput {
    essayTopic: string;
    sectionType: string;
    sectionTitle: string;
    question: string;
    currentDraft?: string;
    citationStyle?: string;
}

interface SummaryInput {
    essayTitle: string;
    outlineTitles: string[];
    writtenEssay: string;
}

interface SummaryOutput {
    done: string[];
    suggestions: string[];
}

const IMPERATIVE_START_RE = /^(define|describe|explain|analyze|discuss|add|use|mention|highlight|include|introduce|compare|show|provide|focus|emphasize|state|outline|present|demonstrate|list|write|talk)\b/i;

function normalizeIdeaLine(raw: string): string {
    let text = String(raw || "")
        .replace(/^[\s\-*•\d.)]+/, "")
        .replace(/^["'`“”]+|["'`“”]+$/g, "")
        .trim();

    if (!text) return "";

    if (/^answer\s*:/i.test(text)) {
        text = text.replace(/^answer\s*:/i, "").trim();
    }

    if (IMPERATIVE_START_RE.test(text) && !/^this section can\b/i.test(text)) {
        const lowered = text.charAt(0).toLowerCase() + text.slice(1);
        text = `This section can ${lowered}`;
    }

    if (!/[.!?]$/.test(text)) {
        text = `${text}.`;
    }

    return text;
}

function fallbackIdeas(sectionTitle: string): string[] {
    return [
        `This section explains ${sectionTitle} by linking it to the broader historical context of the essay.`,
        `The paragraph can highlight one concrete example that shows why ${sectionTitle} is significant.`,
        "A transition line can connect this argument smoothly to the next section of the paper.",
        "The final sentence can reinforce the main claim before moving to the following paragraph.",
    ];
}

export class SuService {
    static async fetchConfig(): Promise<{ apiKey: string; model: string }> {
        const res = await fetch("https://api.octopilotai.com/api/v1/settings/keys");
        if (!res.ok) throw new Error("Failed to fetch API configuration from backend");
        const data: BackendKeyResponse = await res.json();

        if (!data.openrouter_api_key) {
            throw new Error("No active OpenRouter key available in the pool");
        }
        if (!data.secondary_model) {
            throw new Error("No secondary model configured in backend settings");
        }

        return {
            apiKey: data.openrouter_api_key,
            model: data.secondary_model,
        };
    }

    private static async callAssist(payload: object): Promise<SuAssistResponse> {
        const { apiKey, model } = await SuService.fetchConfig();
        const res = await fetch("/api/su/assist", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...payload, apiKey, model }),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `Su assist failed: ${res.status}`);
        }

        return res.json();
    }

    static async generateMoreIdeas(input: MoreIdeasInput): Promise<string[]> {
        if (TestService.isActive) {
            return fallbackIdeas(input.sectionTitle);
        }

        try {
            const response = await SuService.callAssist({ mode: "more_ideas", input });
            const bullets = Array.isArray(response.bullets)
                ? response.bullets.map((v) => normalizeIdeaLine(String(v))).filter(Boolean)
                : [];
            if (bullets.length > 0) return bullets;
        } catch {
            // fallback below
        }

        return fallbackIdeas(input.sectionTitle);
    }

    static async askQuestion(input: AskInput): Promise<string> {
        if (TestService.isActive) {
            return `A focused way to approach this is to anchor the paragraph around one clear claim, then support it with evidence and analysis.`;
        }

        const response = await SuService.callAssist({ mode: "ask", input });
        const answer = String(response.answer || "").trim();
        return answer || "No direct answer returned. Try asking in a more specific way.";
    }

    static async generateInTextCitations(sources: SourceData[], citationStyle: string): Promise<Record<number, string>> {
        if (!sources.length) return {};

        const normalizedSources = sources.map((source, index) => ({
            index,
            title: source.title || "",
            author: source.author || "",
            publishedYear: source.publishedYear || "",
            publisher: source.publisher || "",
            url: source.url || "",
        }));

        if (TestService.isActive) {
            return {};
        }

        const response = await SuService.callAssist({
            mode: "intext",
            input: {
                citationStyle,
                sources: normalizedSources,
            },
        });

        const mapped: Record<number, string> = {};
        for (const item of response.inTextCitation || []) {
            const sourceIndex = Number(item?.index);
            const citation = String(item?.citation || "").trim();
            if (Number.isFinite(sourceIndex) && sourceIndex >= 0 && citation) {
                mapped[sourceIndex] = citation;
            }
        }

        return mapped;
    }

    static async summarizeProgress(input: SummaryInput): Promise<SummaryOutput> {
        if (TestService.isActive) {
            return {
                done: [
                    "The draft already establishes a clear topic focus and an opening context.",
                    "At least one section title is aligned with the main essay direction.",
                ],
                suggestions: [
                    "Strengthen each body section with one concrete source-backed example.",
                    "Add clearer transitions so each section flows into the next argument.",
                ],
            };
        }

        const response = await SuService.callAssist({ mode: "summary", input });
        const done = Array.isArray(response.done)
            ? response.done.map((v) => String(v).trim()).filter(Boolean)
            : [];
        const suggestions = Array.isArray(response.suggestions)
            ? response.suggestions.map((v) => String(v).trim()).filter(Boolean)
            : [];

        return { done, suggestions };
    }
}
