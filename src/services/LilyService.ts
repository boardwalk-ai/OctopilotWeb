// LilyService — client-side service to invoke the Lily outline generation agent.

import { Organizer } from "./OrganizerService";
import { HeinService } from "./HeinService";
import { TestService } from "./TestService";

export interface OutlineItem {
    type: "Introduction" | "Body Paragraph" | "Conclusion";
    title: string;
    description: string;
}

export type GenerateMode = "auto" | "build" | "single";

export class LilyService {
    /**
     * Generate outlines via Lily.
     * @param mode "auto" = 5 outlines, "build" = 1 custom, "single" = 1 of type
     * @param requestedType The paragraph type (for build/single modes)
     * @param customTitle User-provided topic (for build mode)
     */
    static async generate(
        mode: GenerateMode,
        requestedType?: string,
        customTitle?: string
    ): Promise<OutlineItem[]> {
        if (TestService.isActive) {
            const mocks = await TestService.getOutlines();
            if (mode === "single" || mode === "build") {
                return [mocks[0]] as OutlineItem[];
            }
            return mocks as OutlineItem[];
        }

        const state = Organizer.get();

        // Fetch API key + model from backend
        const { apiKey, model } = await HeinService.fetchConfig();

        const res = await fetch("/api/lily/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                analysis: state.analysis,
                essayTopic: state.essayTopic,
                essayType: state.analyzedEssayType,
                scope: state.scope,
                structure: state.structure,
                mode,
                requestedType,
                customTitle,
                apiKey,
                model,
            }),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `Lily generation failed: ${res.status}`);
        }

        const data = await res.json();
        return data.outlines || [];
    }
}
