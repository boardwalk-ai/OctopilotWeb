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
  { id: 1, title: "Analyze the instruction", detail: "Hein reads the prompt and defines the topic.", status: "pending" },
  { id: 2, title: "Setting up outlines", detail: "Lily prepares the paragraph structure.", status: "pending" },
  { id: 3, title: "Source search", detail: "Alvin looks for useful sources.", status: "pending" },
  { id: 4, title: "Sources sidebar", detail: "Source results open in the right column.", status: "pending" },
  { id: 5, title: "Gathering data from sources", detail: "Scraping and compaction run here.", status: "pending" },
  { id: 6, title: "Clarify draft settings", detail: "Ask for missing word count and citation style.", status: "pending" },
  { id: 7, title: "Sculpting the essay", detail: "Lucas writes the draft.", status: "pending" },
  { id: 8, title: "Collect formatting details", detail: "Ask for student, instructor, and course metadata.", status: "pending" },
  { id: 9, title: "Formatting in the background", detail: "Apply the final citation layout without showing the intermediate editor step.", status: "pending" },
  { id: 10, title: "Finished product", detail: "Prepare the PDF-ready export.", status: "pending" },
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
  return {
    id: randomUUID(),
    name,
    args,
  };
}

function todayLabel() {
  return new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function makeQuestion(field: GhostwriterQuestionField): GhostwriterQuestion {
  switch (field) {
    case "wordCount":
      return {
        id: randomUUID(),
        field,
        prompt: "What word count should I target?",
        helperText: "I need this before Lucas can write.",
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
    default:
      return { id: randomUUID(), field, prompt: "One more detail.", inputType: "text" };
  }
}

function getProgress(steps: GhostwriterWorkflowStep[]): GhostwriterProgress {
  const completed = steps.filter((step) => step.status === "completed").length;
  const total = steps.length;
  const percent = Math.round((completed / total) * 100);
  const active = steps.find((step) => step.status === "running" || step.status === "blocked");
  return {
    completed,
    total,
    percent,
    label: active ? active.title : completed === total ? "Finished" : "Waiting",
  };
}

function finalizeState(run: InternalRun, updates: Partial<GhostwriterRunState>): GhostwriterRunState {
  run.state = {
    ...run.state,
    ...updates,
  };
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
  if (!run) {
    throw new Error("Ghostwriter run not found.");
  }
  return run;
}

export function getGhostwriterRun(runId: string) {
  const run = getRunOrThrow(runId);
  return cloneState(run.state);
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
    "studentName",
    "instructorName",
    "institutionName",
    "courseInfo",
    "subjectCode",
    "essayDate",
  ];
  const nextField = fields.find((field) => !run.answers[field]);
  if (nextField) {
    run.state.steps = setStep(run.state.steps, 8, "blocked");
    return finalizeState(run, {
      status: "waiting_for_user",
      pendingToolCall: null,
      pendingQuestion: makeQuestion(nextField),
    });
  }

  run.state.steps = setStep(run.state.steps, 8, "completed", "Formatting details collected.");
  run.state.steps = setStep(run.state.steps, 9, "running");
  return finalizeState(run, {
    status: "running",
    pendingQuestion: null,
    pendingToolCall: makeToolCall("finalize_export", {
      formatAnswers: run.answers,
    }),
  });
}

export function advanceGhostwriterRunWithTool(runId: string, payload: { toolName: GhostwriterToolName; result?: unknown }) {
  const run = getRunOrThrow(runId);
  const { toolName, result } = payload;

  if (toolName === "analyze_instruction") {
    const analysis = (result || {}) as { essayTopic?: string; essayType?: string };
    run.state.context.topic = analysis.essayTopic || "Untitled topic";
    run.state.context.essayType = analysis.essayType || "Essay";
    run.state.steps = setStep(run.state.steps, 1, "completed", `Topic locked: ${run.state.context.topic}`);
    run.state.steps = setStep(run.state.steps, 2, "running");
    return finalizeState(run, {
      pendingToolCall: makeToolCall("generate_outlines"),
      pendingQuestion: null,
      status: "running",
    });
  }

  if (toolName === "generate_outlines") {
    const count = Number((result as { count?: number } | undefined)?.count || 0);
    run.state.steps = setStep(run.state.steps, 2, "completed", `${count} outline blocks are ready.`);
    run.state.steps = setStep(run.state.steps, 3, "running");
    return finalizeState(run, {
      pendingToolCall: makeToolCall("search_sources", { targetCount: 4 }),
      pendingQuestion: null,
      status: "running",
    });
  }

  if (toolName === "search_sources") {
    const sources = ((result as { sources?: AlvinSearchResult[] } | undefined)?.sources || []) as AlvinSearchResult[];
    run.state.context.searchResults = sources;
    run.state.steps = setStep(run.state.steps, 3, "completed", `${sources.length} candidate sources found.`);
    run.state.steps = setStep(run.state.steps, 4, "completed", `${sources.length} sources are visible in the right sidebar.`);
    run.state.steps = setStep(run.state.steps, 5, "running");
    return finalizeState(run, {
      pendingToolCall: makeToolCall("scrape_sources", { sources }),
      pendingQuestion: null,
      status: "running",
    });
  }

  if (toolName === "scrape_sources") {
    const scrapedCount = Number((result as { scrapedCount?: number } | undefined)?.scrapedCount || 0);
    run.state.steps = setStep(run.state.steps, 5, "running", `${scrapedCount} sources scraped. Compacting now.`);
    return finalizeState(run, {
      pendingToolCall: makeToolCall("compact_sources"),
      pendingQuestion: null,
      status: "running",
    });
  }

  if (toolName === "compact_sources") {
    const compactedCount = Number((result as { compactedCount?: number } | undefined)?.compactedCount || 0);
    run.state.steps = setStep(run.state.steps, 5, "completed", `${compactedCount} sources compacted for Lucas.`);
    return askDraftQuestion(run);
  }

  if (toolName === "generate_essay") {
    run.state.steps = setStep(run.state.steps, 7, "completed", "Lucas delivered the essay draft.");
    return askFormatQuestion(run);
  }

  if (toolName === "finalize_export") {
    run.state.steps = setStep(run.state.steps, 9, "completed", "Citation layout applied in the background.");
    run.state.steps = setStep(run.state.steps, 10, "completed", "PDF-ready file is ready to download.");
    return finalizeState(run, {
      status: "finished",
      pendingToolCall: null,
      pendingQuestion: null,
    });
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

  if (answer.field === "wordCount" || answer.field === "citationStyle") {
    return askDraftQuestion(run);
  }

  return askFormatQuestion(run);
}
