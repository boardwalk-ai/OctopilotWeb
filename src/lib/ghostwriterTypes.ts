import type { AlvinSearchResult } from "@/services/AlvinService";
import type { ExportDocumentSnapshot } from "@/services/OrganizerService";

export type GhostwriterToolName =
  | "plan_essay"
  | "search_sources"
  | "scrape_sources"
  | "compact_sources"
  | "evaluate_sources"
  | "write_essay"
  | "critique_essay"
  | "revise_paragraph"
  | "ask_user"
  | "echo"
  | "analyze_instruction"
  | "generate_outlines"
  | "gather_sources"
  | "generate_essay"
  | "finalize_export"
  | "humanize_essay"
  | "split_paragraphs"
  | "finalize_export_humanized";

export type GhostwriterQuestionField =
  | "wordCount"
  | "citationStyle"
  | "outlineCount"
  | "studentName"
  | "instructorName"
  | "institutionName"
  | "courseInfo"
  | "subjectCode"
  | "essayDate"
  | "humanizeChoice"
  | "humanizerChoice"
  | "paragraphSplitChoice";

export type GhostwriterStepStatus = "pending" | "running" | "completed" | "blocked" | "error";

export type GhostwriterWorkflowStep = {
  id: number;
  title: string;
  detail: string;
  status: GhostwriterStepStatus;
  thoughts: string[];
  toolName: string;
  toolArgs?: Record<string, unknown>;
};

export type GhostwriterGoal = {
  title: string;
  description: string;
  successCriteria: string[];
};

export type GhostwriterProgress = {
  completed: number;
  total: number;
  percent: number;
  label: string;
};

export type GhostwriterToolCall = {
  id: string;
  name: GhostwriterToolName;
  args?: Record<string, unknown>;
};

export type GhostwriterQuestion = {
  id: string;
  field: GhostwriterQuestionField;
  prompt: string;
  helperText?: string;
  inputType: "text" | "number" | "select";
  options?: string[];
  suggestions?: string[];
};

export type GhostwriterRunContext = {
  topic?: string;
  essayType?: string;
  wordCount?: number;
  citationStyle?: string;
  essayTopic?: string;
  plan?: {
    thesis: string;
    paragraphCount: number;
    searchQueries: string[];
    notes?: string;
  };
  outlines?: Array<{
    id: string;
    type: string;
    title: string;
    description: string;
  }>;
  searchResults?: AlvinSearchResult[];
  compactedSources?: Array<{
    url: string;
    title?: string;
    author?: string;
    publishedYear?: string;
    publisher?: string;
    summary: string;
  }>;
  essay?: string;
  bibliography?: string;
  exportReady?: boolean;
  exportDoc?: ExportDocumentSnapshot | null;
  humanizedContent?: string;
  humanizeProvider?: string;
  humanizedExportDoc?: ExportDocumentSnapshot | null;
  critiqueIssues?: Array<{
    paragraphIndex: number;
    type: string;
    description: string;
    severity: "major" | "minor";
  }>;
  revisionRounds?: number;
  revisionHistory?: Array<{
    paragraphIndex: number;
    issue: string;
    before: string;
    after: string;
    revisionRound: number;
  }>;
};

export type GhostwriterRunState = {
  runId: string;
  status: "running" | "waiting_for_user" | "finished" | "error";
  goal: GhostwriterGoal;
  progress: GhostwriterProgress;
  steps: GhostwriterWorkflowStep[];
  context: GhostwriterRunContext;
  pendingToolCall: GhostwriterToolCall | null;
  pendingQuestion: GhostwriterQuestion | null;
  error?: string;
};
