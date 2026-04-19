// AgentContext — run-local state for the Ghostwriter agent.
//
// This replaces the `Organizer` singleton's role *for the duration of a
// single agent run*. Tools read from and write to this object; the loop
// emits a `context_update` event whenever a tool mutates it so the client
// can mirror relevant slices for live UI.
//
// Lifetime: one instance per `AgentRun`. Attached to the run in `runs.ts`.
// Persistence: in-memory only (see milestone 1/6 notes on the runs store).

import type { ExportDocumentSnapshot } from "@/services/OrganizerService";

export type OutlineType = "Introduction" | "Body Paragraph" | "Conclusion";

export type OutlineItem = {
  // Stable within a run so `write_paragraph` can reference an outline by id.
  id: string;
  type: OutlineType;
  title: string;
  description: string;
};

export type EssayPlan = {
  // One-sentence thesis the essay will argue / explain.
  thesis: string;
  // Suggested paragraph count (1 intro + N body + 1 conclusion).
  paragraphCount: number;
  // Search strategy hints for the researcher step.
  searchQueries: string[];
  // Free-form notes the orchestrator can consult later. Not rendered.
  notes?: string;
};

// Minimal slice of the legacy source shape. Widens as 3b/3c tools land.
export type SearchResultLite = {
  title: string;
  url: string;
  author?: string;
  publishedYear?: string;
  publisher?: string;
};

export type ScrapedSourceLite = SearchResultLite & {
  fullContent: string;
};

export type CompactedSourceLite = SearchResultLite & {
  summary: string;
};

export type DraftedParagraph = {
  outlineId: string;
  text: string;
};

export type CritiqueIssue = {
  // 0-based index into the essay's paragraph array (split by \n\n)
  paragraphIndex: number;
  type: "thesis" | "evidence" | "clarity" | "citations" | "length" | "structure";
  description: string;
  severity: "major" | "minor";
};

export type AgentDraftSettings = {
  wordCount?: number;
  citationStyle?: string;
  tone?: string;
  keywords?: string;
};

export type AgentFormatAnswers = {
  finalEssayTitle?: string;
  studentName?: string;
  instructorName?: string;
  institutionName?: string;
  courseInfo?: string;
  subjectCode?: string;
  essayDate?: string;
};

// The full run-local state. Every field is optional until the tool that
// populates it runs — tools should treat missing fields as "call the
// prerequisite first" rather than crashing. The orchestrator's system
// prompt tells the model what the prerequisites are.
export type AgentContext = {
  // Verbatim user instruction (already bundled with any client-extracted
  // file text before the run started).
  instruction: string;

  // Essay-identification outputs.
  essayTopic?: string;
  essayType?: string;

  // Planning output.
  plan?: EssayPlan;

  // Outline layer.
  outlines: OutlineItem[];

  // Research layer (populated by 3b tools).
  searchResults: SearchResultLite[];
  scrapedSources: ScrapedSourceLite[];
  compactedSources: CompactedSourceLite[];

  // Drafting layer (populated by 3c tools).
  paragraphs: DraftedParagraph[];
  essay?: string;
  bibliography?: string;

  // Critique + revision layer (populated by 5 tools).
  critiqueIssues: CritiqueIssue[];
  revisionRounds: number;

  // Humanization layer (populated by 3d tools).
  humanizedContent?: string;
  humanizerProvider?: "StealthGPT" | "UndetectableAI";

  // User-supplied bits.
  draftSettings: AgentDraftSettings;
  formatAnswers: AgentFormatAnswers;

  // Set when a finalize tool has packaged the export snapshot (either as
  // a server-built object or, for client-rendered PDFs, a signal that the
  // client should assemble one from the current context).
  exportReady: boolean;
  exportDoc?: ExportDocumentSnapshot;
};

export function createAgentContext(instruction: string): AgentContext {
  return {
    instruction,
    outlines: [],
    searchResults: [],
    scrapedSources: [],
    compactedSources: [],
    paragraphs: [],
    critiqueIssues: [],
    revisionRounds: 0,
    draftSettings: {},
    formatAnswers: {},
    exportReady: false,
  };
}
