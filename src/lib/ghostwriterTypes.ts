import type { AlvinSearchResult } from "@/services/AlvinService";

export type GhostwriterToolName =
  | "analyze_instruction"
  | "generate_outlines"
  | "search_sources"
  | "scrape_sources"
  | "compact_sources"
  | "generate_essay"
  | "finalize_export";

export type GhostwriterQuestionField =
  | "wordCount"
  | "citationStyle"
  | "studentName"
  | "instructorName"
  | "institutionName"
  | "courseInfo"
  | "subjectCode"
  | "essayDate";

export type GhostwriterStepStatus = "pending" | "running" | "completed" | "blocked";

export type GhostwriterWorkflowStep = {
  id: number;
  title: string;
  detail: string;
  status: GhostwriterStepStatus;
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
};

export type GhostwriterRunContext = {
  topic?: string;
  essayType?: string;
  wordCount?: number;
  citationStyle?: string;
  searchResults?: AlvinSearchResult[];
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
