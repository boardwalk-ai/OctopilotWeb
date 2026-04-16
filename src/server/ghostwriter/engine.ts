import { randomUUID } from "crypto";
import type {
  GhostwriterGoal,
  GhostwriterProgress,
  GhostwriterQuestion,
  GhostwriterQuestionField,
  GhostwriterRunState,
  GhostwriterToolCall,
  GhostwriterToolName,
  GhostwriterWorkflowStep,
} from "@/lib/ghostwriterTypes";
import type { AlvinSearchResult } from "@/services/AlvinService";

type DraftSettingsDetection = {
  wordCount?: number;
  citationStyle?: string;
};

type InternalRun = {
  state: GhostwriterRunState;
  detection: DraftSettingsDetection;
  answers: Partial<Record<GhostwriterQuestionField, string | number>>;
};

const runStore = new Map<string, InternalRun>();

const INITIAL_STEPS: GhostwriterWorkflowStep[] = [
  { id: 1,  title: "Analyzing your instruction",      detail: "Reading the prompt and locking in the topic.",              status: "pending" },
  { id: 2,  title: "Building paragraph outlines",     detail: "Structuring the essay section by section.",                 status: "pending" },
  { id: 3,  title: "Searching for sources",           detail: "Looking for relevant, citable sources.",                    status: "pending" },
  { id: 4,  title: "Populating the sources panel",    detail: "Loading search results into the sidebar.",                  status: "pending" },
  { id: 5,  title: "Gathering data from sources",     detail: "Scraping and compacting source content.",                   status: "pending" },
  { id: 6,  title: "Checking draft settings",         detail: "Confirming word count and citation style before writing.",  status: "pending" },
  { id: 7,  title: "Writing your essay",              detail: "Drafting the full essay from outlines and sources.",        status: "pending" },
  { id: 8,  title: "Collecting formatting details",   detail: "Gathering student, instructor, and course metadata.",       status: "pending" },
  { id: 9,  title: "Applying citation layout",        detail: "Running the citation formatter in the background.",         status: "pending" },
  { id: 10, title: "Preparing your PDF",              detail: "Packaging the final document for download.",                status: "pending" },
  { id: 11, title: "Humanizing your essay",           detail: "Processing with AI detection bypass.",                      status: "pending" },
  { id: 12, title: "Packaging humanized document",    detail: "Building the final cleaned-up PDF.",                        status: "pending" },
];

const GOAL: GhostwriterGoal = {
  title: "Deliver a downloadable, fully formatted essay PDF",
  description: "Use the existing Octopilot agents and tools to move from raw instructions to a cited, export-ready paper without skipping missing requirements.",
  successCriteria: [
    "A topic is defined from the instruction.",
    "Outlines and usable sources are gathered.",
    "Missing draft constraints are asked explicitly.",
    "The essay is generated and formatted.",
    "A PDF-ready export snapshot is available.",
  ],
};

function cloneState(state: GhostwriterRunState): GhostwriterRunState {
  return JSON.parse(JSON.stringify(state)) as GhostwriterRunState;
}

function setStep(steps: GhostwriterWorkflowStep[], id: number, status: GhostwriterWorkflowStep["status"], detail?: string) {
  return steps.map((step) => (
    step.id === id
      ? { ...step, status, detail: detail || step.detail }
      : step
  ));
}

function makeToolCall(name: GhostwriterToolName, args?: Record<string, unknown>): GhostwriterToolCall {
  return { id: randomUUID(), name, args };
}

function todayLabel() {
  return new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function makeQuestion(field: GhostwriterQuestionField): GhostwriterQuestion {
  switch (field) {
    case "outlineCount":
      return {
        id: randomUUID(),
        field,
        prompt: "How many sections should I build for this essay?",
        helperText: "Each section becomes one paragraph in the final draft.",
        inputType: "number",
        suggestions: ["3", "5", "7", "10"],
      };
    case "wordCount":
      return {
        id: randomUUID(),
        field,
        prompt: "What word count should I target?",
        helperText: "I need this before I can start writing.",
        inputType: "number",
        suggestions: ["500", "800", "1200", "2000"],
      };
    case "citationStyle":
      return {
        id: randomUUID(),
        field,
        prompt: "Which citation format should I use?",
        helperText: "Choose the format that should drive the final layout.",
        inputType: "select",
        options: ["APA", "MLA", "Chicago", "Harvard", "IEEE", "None"],
        suggestions: ["APA", "MLA", "Chicago", "Harvard", "IEEE", "None"],
      };
    case "studentName":
      return { id: randomUUID(), field, prompt: "What is the student name?", inputType: "text" };
    case "instructorName":
      return { id: randomUUID(), field, prompt: "Who is the instructor?", inputType: "text" };
    case "institutionName":
      return { id: randomUUID(), field, prompt: "Which institution should appear on the paper?", inputType: "text" };
    case "courseInfo":
      return { id: randomUUID(), field, prompt: "What course information should I show?", inputType: "text" };
    case "subjectCode":
      return { id: randomUUID(), field, prompt: "What is the subject or course code?", inputType: "text" };
    case "essayDate":
      return {
        id: randomUUID(),
        field,
        prompt: "What date should appear on the essay?",
        inputType: "text",
        suggestions: [todayLabel()],
      };
    case "humanizeChoice":
      return {
        id: randomUUID(),
        field,
        prompt: "Should I run this through a humanizer to reduce AI detection?",
        inputType: "text",
        suggestions: ["Yes", "No"],
      };
    case "humanizerChoice":
      return {
        id: randomUUID(),
        field,
        prompt: "Which humanizer should I use?",
        inputType: "text",
        suggestions: ["UndetectableAI", "StealthGPT"],
      };
    default:
      return { id: randomUUID(), field, prompt: "One more detail.", inputType: "text" };
  }
}

function getProgress(steps: GhostwriterWorkflowStep[]): GhostwriterProgress {
  const active = steps.filter((s) => s.status !== "pending");
  const completed = steps.filter((s) => s.status === "completed").length;
  const total = active.length || 1;
  const percent = Math.round((completed / steps.length) * 100);
  const running = steps.find((s) => s.status === "running" || s.status === "blocked");
  return {
    completed,
    total: steps.length,
    percent,
    label: running ? running.title : completed === steps.length ? "Finished" : "Waiting",
  };
}

function finalizeState(run: InternalRun, updates: Partial<GhostwriterRunState>): GhostwriterRunState {
  run.state = { ...run.state, ...updates };
  run.state.progress = getProgress(run.state.steps);
  return cloneState(run.state);
}

export function createGhostwriterRun(input: { prompt: string; detectedSettings?: DraftSettingsDetection }) {
  const runId = randomUUID();
  const steps = setStep(INITIAL_STEPS, 1, "running");
  const run: InternalRun = {
    detection: input.detectedSettings || {},
    answers: {},
    state: {
      runId,
      status: "running",
      goal: GOAL,
      progress: getProgress(steps),
      steps,
      context: {},
      pendingToolCall: makeToolCall("analyze_instruction"),
      pendingQuestion: null,
    },
  };
  runStore.set(runId, run);
  return cloneState(run.state);
}

function getRunOrThrow(runId: string) {
  const run = runStore.get(runId);
  if (!run) throw new Error("Ghostwriter run not found.");
  return run;
}

export function getGhostwriterRun(runId: string) {
  return cloneState(getRunOrThrow(runId).state);
}

function askDraftQuestion(run: InternalRun) {
  if (!run.detection.wordCount && !run.answers.wordCount) {
    run.state.steps = setStep(run.state.steps, 6, "blocked");
    return finalizeState(run, {
      status: "waiting_for_user",
      pendingToolCall: null,
      pendingQuestion: makeQuestion("wordCount"),
    });
  }
  if (!run.detection.citationStyle && !run.answers.citationStyle) {
    run.state.steps = setStep(run.state.steps, 6, "blocked");
    return finalizeState(run, {
      status: "waiting_for_user",
      pendingToolCall: null,
      pendingQuestion: makeQuestion("citationStyle"),
    });
  }
  const wordCount = Number(run.answers.wordCount || run.detection.wordCount || 1200);
  const citationStyle = String(run.answers.citationStyle || run.detection.citationStyle || "APA");
  run.state.context.wordCount = wordCount;
  run.state.context.citationStyle = citationStyle;
  run.state.steps = setStep(run.state.steps, 6, "completed", `Using ${wordCount} words in ${citationStyle}.`);
  run.state.steps = setStep(run.state.steps, 7, "running");
  return finalizeState(run, {
    status: "running",
    pendingQuestion: null,
    pendingToolCall: makeToolCall("generate_essay"),
  });
}

function askFormatQuestion(run: InternalRun) {
  const fields: GhostwriterQuestionField[] = [
    "studentName", "instructorName", "institutionName",
    "courseInfo", "subjectCode", "essayDate",
  ];
  const nextField = fields.find((f) => !run.answers[f]);
  if (nextField) {
    run.state.steps = setStep(run.state.steps, 8, "blocked");
    return finalizeState(run, {
      status: "waiting_for_user",
      pendingToolCall: null,
      pendingQuestion: makeQuestion(nextField),
    });
  }
  run.state.steps = setStep(run.state.steps, 8, "completed", "All formatting metadata collected.");
  run.state.steps = setStep(run.state.steps, 9, "running");
  return finalizeState(run, {
    status: "running",
    pendingQuestion: null,
    pendingToolCall: makeToolCall("finalize_export", { formatAnswers: run.answers }),
  });
}

export function advanceGhostwriterRunWithTool(runId: string, payload: { toolName: GhostwriterToolName; result?: unknown }) {
  const run = getRunOrThrow(runId);
  const { toolName, result } = payload;

  if (toolName === "analyze_instruction") {
    const analysis = (result || {}) as { essayTopic?: string; essayType?: string };
    run.state.context.topic = analysis.essayTopic || "Untitled topic";
    run.state.context.essayType = analysis.essayType || "Essay";
    run.state.steps = setStep(run.state.steps, 1, "completed", `Topic identified: ${run.state.context.topic}`);
    // Ask how many outline sections before building
    return finalizeState(run, {
      status: "waiting_for_user",
      pendingToolCall: null,
      pendingQuestion: makeQuestion("outlineCount"),
    });
  }

  if (toolName === "generate_outlines") {
    const count = Number((result as { count?: number } | undefined)?.count || 0);
    run.state.steps = setStep(run.state.steps, 2, "completed", `Built ${count} outline sections.`);
    // Mark source steps as running (gather_sources handles 3→4→5 internally)
    run.state.steps = setStep(run.state.steps, 3, "running");
    run.state.steps = setStep(run.state.steps, 4, "running");
    run.state.steps = setStep(run.state.steps, 5, "running");
    return finalizeState(run, {
      pendingToolCall: makeToolCall("gather_sources"),
      pendingQuestion: null,
      status: "running",
    });
  }

  if (toolName === "gather_sources") {
    const r = (result || {}) as { scrapedCount?: number; compactedCount?: number; searchResults?: AlvinSearchResult[] };
    const scrapedCount = Number(r.scrapedCount || 0);
    const compactedCount = Number(r.compactedCount || 0);
    if (r.searchResults) run.state.context.searchResults = r.searchResults;
    run.state.steps = setStep(run.state.steps, 3, "completed", `Found sources after retry loops.`);
    run.state.steps = setStep(run.state.steps, 4, "completed", `Loaded ${scrapedCount} sources into the sidebar.`);
    run.state.steps = setStep(run.state.steps, 5, "completed", `Compacted ${compactedCount} sources for the essay draft.`);
    return askDraftQuestion(run);
  }

  if (toolName === "generate_essay") {
    run.state.steps = setStep(run.state.steps, 7, "completed", "Essay draft written and ready.");
    return askFormatQuestion(run);
  }

  if (toolName === "finalize_export") {
    run.state.steps = setStep(run.state.steps, 9, "completed", "Citation layout applied successfully.");
    run.state.steps = setStep(run.state.steps, 10, "completed", "Your PDF is packaged and ready to download.");
    // Don't finish yet — ask about humanization
    return finalizeState(run, {
      status: "waiting_for_user",
      pendingToolCall: null,
      pendingQuestion: makeQuestion("humanizeChoice"),
    });
  }

  if (toolName === "humanize_essay") {
    const r = (result || {}) as { humanized?: string; provider?: string };
    run.state.context.humanizedContent = r.humanized || "";
    run.state.context.humanizeProvider = r.provider || "";
    run.state.steps = setStep(run.state.steps, 11, "completed", `Humanized with ${r.provider || "AI"}.`);
    run.state.steps = setStep(run.state.steps, 12, "running");
    return finalizeState(run, {
      status: "running",
      pendingToolCall: makeToolCall("finalize_export_humanized", {
        formatAnswers: run.answers,
        humanized: r.humanized || "",
      }),
      pendingQuestion: null,
    });
  }

  if (toolName === "finalize_export_humanized") {
    run.state.steps = setStep(run.state.steps, 12, "completed", "Humanized PDF ready to download.");
    return finalizeState(run, { status: "finished", pendingToolCall: null, pendingQuestion: null });
  }

  return finalizeState(run, {
    status: "error",
    error: `Unsupported tool result: ${toolName}`,
    pendingToolCall: null,
    pendingQuestion: null,
  });
}

export function answerGhostwriterRun(runId: string, answer: { field: GhostwriterQuestionField; value: string | number }) {
  const run = getRunOrThrow(runId);
  run.answers[answer.field] = answer.value;

  if (answer.field === "outlineCount") {
    run.state.steps = setStep(run.state.steps, 2, "running");
    return finalizeState(run, {
      status: "running",
      pendingQuestion: null,
      pendingToolCall: makeToolCall("generate_outlines", { count: Number(answer.value) || 5 }),
    });
  }

  if (answer.field === "wordCount" || answer.field === "citationStyle") {
    return askDraftQuestion(run);
  }

  if (answer.field === "humanizeChoice") {
    const choice = String(answer.value).toLowerCase();
    if (choice === "no") {
      return finalizeState(run, { status: "finished", pendingToolCall: null, pendingQuestion: null });
    }
    return finalizeState(run, {
      status: "waiting_for_user",
      pendingToolCall: null,
      pendingQuestion: makeQuestion("humanizerChoice"),
    });
  }

  if (answer.field === "humanizerChoice") {
    run.state.steps = setStep(run.state.steps, 11, "running");
    return finalizeState(run, {
      status: "running",
      pendingQuestion: null,
      pendingToolCall: makeToolCall("humanize_essay", { provider: String(answer.value) }),
    });
  }

  return askFormatQuestion(run);
}
