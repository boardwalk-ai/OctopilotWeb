"use client";

import { AuthService } from "@/services/AuthService";
import { OrganizerState } from "@/services/OrganizerService";
import { OctopilotAPIService } from "@/services/OctopilotAPIService";

type WritingMode = "automation" | "manual";

type SessionPayload = {
  login_email?: string;
  writing_mode?: WritingMode;
  writing_style_status?: string;
  writing_style_file_name?: string | null;
  instruction_source?: string | null;
  instruction_file_name?: string | null;
  imperfect_mode_opened?: boolean;
  major_name?: string | null;
  essay_type?: string | null;
  used_outline_count?: number | null;
  word_count?: number | null;
  citation_format?: string | null;
  essay_tone?: string | null;
  sources_count?: number | null;
  essay_title?: string | null;
  student_name?: string | null;
  instructor_name?: string | null;
  institution_name?: string | null;
  course_code?: string | null;
  course_information?: string | null;
  essay_date?: string | null;
  generated_output_word_count?: number | null;
  is_humanized?: boolean;
  humanize_before_word_count?: number | null;
  humanize_after_word_count?: number | null;
  humanized_words_count?: number | null;
  final_page_count?: number | null;
  export_status?: string | null;
  export_type?: string | null;
  last_download_file_name?: string | null;
  download_count?: number | null;
  download_history_json?: string | null;
  session_closed_at?: string | null;
  manual_more_ideas_count?: number | null;
  manual_more_ideas_bullet_count?: number | null;
  manual_ask_count?: number | null;
  manual_summary_count?: number | null;
};

type SessionCreateResponse = {
  id: string;
};

type StoredSession = {
  sessionId: string | null;
  payload: SessionPayload;
};

type DownloadEvent = {
  type: "pdf" | "txt";
  fileName: string;
  pageCount: number;
  downloadedAt: string;
};

const STORAGE_KEY = "octopilot.tracker.session";
let memorySession: StoredSession | null = null;
let requestQueue: Promise<void> = Promise.resolve();
let startPromise: Promise<string | null> | null = null;
let trackingFlagCache: { enabled: boolean; expiresAt: number } | null = null;
let closingSessionId: string | null = null;

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function readStored(): StoredSession | null {
  if (memorySession) return memorySession;
  if (!canUseStorage()) return null;

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    memorySession = JSON.parse(raw) as StoredSession;
    return memorySession;
  } catch {
    return null;
  }
}

function writeStored(next: StoredSession | null): void {
  memorySession = next;
  if (!canUseStorage()) return;

  try {
    if (next) {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } else {
      window.sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Ignore storage write failures.
  }
}

function enqueue(task: () => Promise<void>): Promise<void> {
  requestQueue = requestQueue.then(task).catch((error) => {
    console.error("[TrackerService] Request failed", error);
  });
  return requestQueue;
}

async function isTrackingEnabled(): Promise<boolean> {
  if (trackingFlagCache && trackingFlagCache.expiresAt > Date.now()) {
    return trackingFlagCache.enabled;
  }

  try {
    const response = await fetch("/api/settings/session-tracking", {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) {
      trackingFlagCache = { enabled: true, expiresAt: Date.now() + 30_000 };
      return true;
    }

    const payload = (await response.json()) as { enabled?: boolean };
    const enabled = payload.enabled !== false;
    trackingFlagCache = { enabled, expiresAt: Date.now() + 30_000 };
    return enabled;
  } catch {
    trackingFlagCache = { enabled: true, expiresAt: Date.now() + 30_000 };
    return true;
  }
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function buildPayloadFromOrganizer(org: OrganizerState): SessionPayload {
  const generatedOutputWordCount = org.exportDocument
    ? org.exportDocument.pages.reduce((sum, page) => sum + countWords(page.plainText), 0)
    : (org.generatedEssay.trim() ? countWords(org.generatedEssay) : 0);

  return {
    writing_mode: org.writingMode,
    writing_style_status: org.writingStyleStatus,
    writing_style_file_name: org.writingStyleFileName,
    instruction_source: org.instructionSource,
    instruction_file_name: org.instructionFileName,
    imperfect_mode_opened: org.imperfectModeEnabled,
    major_name: org.majorName || null,
    essay_type: org.essayType || null,
    used_outline_count: org.selectedOutlines.length,
    word_count: typeof org.wordCount === "number" ? org.wordCount : null,
    citation_format: org.citationStyle || null,
    essay_tone: org.tone || null,
    sources_count: org.selectedSourceCount || 0,
    essay_title: org.finalEssayTitle || null,
    student_name: org.studentName || null,
    instructor_name: org.instructorName || null,
    institution_name: org.institutionName || null,
    course_code: org.subjectCode || null,
    course_information: org.courseInfo || null,
    essay_date: org.essayDate || null,
    generated_output_word_count: generatedOutputWordCount,
    is_humanized: org.isHumanized,
    humanize_before_word_count: org.humanizeBeforeWordCount || 0,
    humanize_after_word_count: org.humanizeAfterWordCount || 0,
    humanized_words_count: org.humanizeAfterWordCount || 0,
    final_page_count: org.exportDocument?.pages.length || 0,
    manual_more_ideas_count: org.manualMoreIdeasCount,
    manual_more_ideas_bullet_count: org.manualMoreIdeasBulletCount,
    manual_ask_count: org.manualAskCount,
    manual_summary_count: org.manualSummaryCount,
  };
}

function getDiff(existing: SessionPayload, next: SessionPayload): SessionPayload {
  const diff: SessionPayload = {};
  for (const [key, value] of Object.entries(next)) {
    const typedKey = key as keyof SessionPayload;
    const previous = existing[typedKey];
    if (JSON.stringify(previous) !== JSON.stringify(value)) {
      (diff as Record<string, unknown>)[typedKey] = value;
    }
  }
  return diff;
}

export class TrackerService {
  static getSessionId(): string | null {
    return readStored()?.sessionId || null;
  }

  static async startSession(writingMode: WritingMode): Promise<string | null> {
    if (!(await isTrackingEnabled())) {
      return null;
    }

    const existing = readStored();
    if (existing?.sessionId && !existing.payload.session_closed_at) {
      await TrackerService.updateSession({
        writing_mode: writingMode,
        session_closed_at: null,
      });
      return existing.sessionId;
    }

    if (startPromise) {
      return startPromise;
    }

    startPromise = (async () => {
      const loginEmail = AuthService.getCurrentUser()?.email || "";
      const response = await OctopilotAPIService.post<SessionCreateResponse>("/api/v1/sessions", {
        login_email: loginEmail,
        writing_mode: writingMode,
      });

      writeStored({
        sessionId: response.id,
        payload: {
          login_email: loginEmail,
          writing_mode: writingMode,
        },
      });

      return response.id;
    })();

    try {
      return await startPromise;
    } finally {
      startPromise = null;
    }
  }

  static async updateSession(partial: SessionPayload): Promise<void> {
    if (!(await isTrackingEnabled())) {
      return;
    }

    const current = readStored();
    if (!current?.sessionId) return;
    const isClosePatch = Object.prototype.hasOwnProperty.call(partial, "session_closed_at");
    if ((current.payload.session_closed_at || closingSessionId === current.sessionId) && !isClosePatch) {
      return;
    }

    const diff = getDiff(current.payload, partial);
    if (Object.keys(diff).length === 0) return;

    const next: StoredSession = {
      sessionId: current.sessionId,
      payload: {
        ...current.payload,
        ...diff,
      },
    };
    writeStored(next);

    await enqueue(async () => {
      await OctopilotAPIService.patch(`/api/v1/sessions/${next.sessionId}`, diff);
    });
  }

  static async syncOrganizer(org: OrganizerState): Promise<void> {
    if (!(await isTrackingEnabled())) {
      return;
    }
    await TrackerService.updateSession(buildPayloadFromOrganizer(org));
  }

  static async trackDownload(download: { type: "pdf" | "txt"; fileName: string; pageCount: number }): Promise<void> {
    if (!(await isTrackingEnabled())) {
      return;
    }

    const current = readStored();
    if (!current?.sessionId) return;

    let history: DownloadEvent[] = [];
    if (current.payload.download_history_json) {
      try {
        history = JSON.parse(current.payload.download_history_json) as DownloadEvent[];
      } catch {
        history = [];
      }
    }

    history.push({
      ...download,
      downloadedAt: new Date().toISOString(),
    });

    await TrackerService.updateSession({
      export_status: "downloaded",
      export_type: download.type.toUpperCase(),
      final_page_count: download.pageCount,
      last_download_file_name: download.fileName,
      download_count: history.length,
      download_history_json: JSON.stringify(history),
    });
  }

  static async closeSession(): Promise<void> {
    if (!(await isTrackingEnabled())) {
      TrackerService.clear();
      return;
    }

    const current = readStored();
    if (!current?.sessionId) return;

    const closedAt = new Date().toISOString();
    closingSessionId = current.sessionId;
    writeStored({
      sessionId: current.sessionId,
      payload: {
        ...current.payload,
        session_closed_at: closedAt,
        export_status: current.payload.export_status || "completed",
      },
    });

    await TrackerService.updateSession({
      session_closed_at: closedAt,
      export_status: current.payload.export_status || "completed",
    });
  }

  static clear(): void {
    trackingFlagCache = null;
    closingSessionId = null;
    writeStored(null);
  }
}
