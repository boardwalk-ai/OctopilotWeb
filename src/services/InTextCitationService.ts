import { SourceData } from "./OrganizerService";
import { CitationTemplateService } from "./CitationTemplateService";
import { SuService } from "./SuService";

export class InTextCitationService {
    static async buildForSources(sources: SourceData[], citationStyle: string): Promise<Record<number, string>> {
        if (!sources.length) return {};

        try {
            const aiCitations = await SuService.generateInTextCitations(sources, citationStyle);
            if (Object.keys(aiCitations).length > 0) {
                return aiCitations;
            }
        } catch (error) {
            console.warn("[InTextCitationService] Su fallback to template formatter", error);
        }

        const fallback: Record<number, string> = {};
        sources.forEach((source, index) => {
            fallback[index] = CitationTemplateService.formatInText(citationStyle, source, index + 1);
        });
        return fallback;
    }
}
