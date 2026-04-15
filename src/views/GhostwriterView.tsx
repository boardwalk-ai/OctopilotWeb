"use client";

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { User } from "firebase/auth";
import { Sora } from "next/font/google";
import {
  AppHeader,
  BackToHome,
  MainHeaderActions,
} from "@/components/header";
import { AuthService } from "@/services/AuthService";
import styles from "./GhostwriterView.module.css";

const sora = Sora({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

type GhostwriterViewProps = {
  onBack: () => void;
};

type SpeechRecognitionAlternative = {
  transcript: string;
};

type SpeechRecognitionResultLike = {
  0: SpeechRecognitionAlternative;
  isFinal: boolean;
  length: number;
};

type SpeechRecognitionEventLike = Event & {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: Event & { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

function getFirstName(user: User | null) {
  const displayName = user?.displayName?.trim() || "";
  if (displayName) {
    return displayName.split(/\s+/)[0] || "";
  }

  const email = user?.email?.trim() || "";
  if (!email) return "";
  return email.split("@")[0]?.split(/[._-]/)[0] || "";
}

function toTitleCase(value: string) {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getGreetingLabel(user: User | null) {
  const firstName = toTitleCase(getFirstName(user));
  const hour = new Date().getHours();

  if (firstName) {
    if (hour < 5) return `Hey there, ${firstName}`;
    if (hour < 12) return `Hello, ${firstName}`;
    if (hour < 18) return `What are we building, ${firstName}?`;
    return `Back at it, ${firstName}?`;
  }

  if (hour < 5) return "Hey there, night owl";
  if (hour < 12) return "Hello, bright mind";
  if (hour < 18) return "What's on your mind?";
  return "Ready for the next sharp draft?";
}

function getPromptPlaceholder(user: User | null) {
  const firstName = toTitleCase(getFirstName(user));
  if (firstName) {
    return `Drop the brief, ${firstName}. I can shape the draft, rewrite a section, or polish attached sources.`;
  }

  return "Drop the brief. I can shape the draft, rewrite a section, or polish attached sources.";
}

function formatFileSize(file: File) {
  if (file.size < 1024 * 1024) {
    return `${Math.max(1, Math.round(file.size / 1024))} KB`;
  }

  return `${(file.size / (1024 * 1024)).toFixed(1)} MB`;
}

export default function GhostwriterView({ onBack }: GhostwriterViewProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const [user, setUser] = useState<User | null>(() => AuthService.getCurrentUser());
  const [prompt, setPrompt] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [sourceSearchEnabled, setSourceSearchEnabled] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [speechError, setSpeechError] = useState("");
  const [submitMessage, setSubmitMessage] = useState("");
  const greeting = getGreetingLabel(user);
  const promptPlaceholder = getPromptPlaceholder(user);

  useEffect(() => {
    const unsubscribe = AuthService.subscribe(setUser);

    return () => {
      unsubscribe();
      recognitionRef.current?.stop();
    };
  }, []);

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  const handleFilesSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const pickedFiles = Array.from(event.target.files || []);
    if (pickedFiles.length === 0) return;

    setAttachments((prev) => [...prev, ...pickedFiles]);
    setSubmitMessage("");
    event.target.value = "";
  };

  const removeAttachment = (indexToRemove: number) => {
    setAttachments((prev) => prev.filter((_, index) => index !== indexToRemove));
    setSubmitMessage("");
  };

  const toggleVoiceInput = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setSpeechError("Voice input is not supported in this browser.");
      return;
    }

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      let finalTranscript = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) {
          finalTranscript += result[0]?.transcript || "";
        }
      }

      if (finalTranscript.trim()) {
        setPrompt((prev) => `${prev.trimEnd()}${prev.trim() ? "\n" : ""}${finalTranscript.trim()}`);
        setSubmitMessage("");
      }
    };

    recognition.onerror = (event) => {
      if (event.error === "not-allowed") {
        setSpeechError("Microphone permission is blocked.");
      } else {
        setSpeechError("Voice transcription stopped unexpectedly.");
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    setSpeechError("");
    setIsListening(true);
    recognition.start();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!prompt.trim() && attachments.length === 0) {
      setSubmitMessage("Add a prompt or attach sources first.");
      return;
    }

    setSubmitMessage(sourceSearchEnabled
      ? "Ghostwriter draft staged with source search enabled."
      : "Ghostwriter draft staged with local-only input.");
  };

  return (
    <div className={`fixed inset-0 flex flex-col overflow-hidden bg-[#0a0a0a] ${styles.ghostwriterShell}`}>
      <AppHeader
        className={styles.ghostwriterHeader}
        left={<BackToHome onClick={onBack} />}
        right={<MainHeaderActions />}
      />

      <div className={styles.ghostwriterBackdropGrid} />

      <main className={styles.ghostwriterBody}>
        <div className={styles.ghostwriterCenter}>
          <Image
            src="/OCTOPILOT.png"
            alt="Octopilot"
            width={88}
            height={88}
            className={styles.ghostwriterLogo}
          />

          <h1 className={`${sora.className} ${styles.ghostwriterGreeting}`}>
            {greeting}
          </h1>

          <p className={styles.ghostwriterSubtitle}>
            Draft fast. Revise cleanly. Bring a messy idea, a source pack, or a rough section and turn it into sharper prose.
          </p>

          <form className={styles.ghostwriterComposer} onSubmit={handleSubmit}>
            {attachments.length > 0 && (
              <div className={styles.attachmentTray}>
                {attachments.map((file, index) => (
                  <div key={`${file.name}-${file.size}-${index}`} className={styles.attachmentCard}>
                    <div className={styles.attachmentPreview}>
                      <span className={styles.attachmentType}>
                        {file.type.startsWith("image/")
                          ? "IMG"
                          : file.type.includes("pdf") || file.name.toLowerCase().endsWith(".pdf")
                            ? "PDF"
                            : "TXT"}
                      </span>
                    </div>
                    <div className={styles.attachmentCopy}>
                      <span className={styles.attachmentName}>{file.name}</span>
                      <span className={styles.attachmentMeta}>{formatFileSize(file)}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAttachment(index)}
                      className={styles.attachmentRemove}
                      aria-label={`Remove ${file.name}`}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m18 6-12 12" />
                        <path d="m6 6 12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            <textarea
              value={prompt}
              onChange={(event) => {
                setPrompt(event.target.value);
                setSubmitMessage("");
              }}
              placeholder={promptPlaceholder}
              className={styles.ghostwriterInput}
              rows={5}
            />

            <div className={styles.ghostwriterActions}>
              <div className={styles.ghostwriterActionCluster}>
                <button
                  type="button"
                  onClick={openFilePicker}
                  className={styles.actionButton}
                  aria-label="Upload PDF, image, or TXT files"
                  title="Upload PDF, image, or TXT files"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 5v14" />
                    <path d="M5 12h14" />
                  </svg>
                </button>

                <button
                  type="button"
                  onClick={() => setSourceSearchEnabled((prev) => !prev)}
                  className={`${styles.actionButton} ${sourceSearchEnabled ? styles.actionButtonActive : ""}`}
                  aria-pressed={sourceSearchEnabled}
                  title="Toggle source search"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M3 12h18" />
                    <path d="M12 3a15 15 0 0 1 0 18" />
                    <path d="M12 3a15 15 0 0 0 0 18" />
                  </svg>
                  <span className={styles.actionLabel}>Source</span>
                </button>
              </div>

              <div className={styles.ghostwriterActionCluster}>
                <button
                  type="button"
                  onClick={toggleVoiceInput}
                  className={`${styles.actionButton} ${isListening ? styles.voiceButtonActive : ""}`}
                  title="Toggle voice transcription"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="3" width="6" height="12" rx="3" />
                    <path d="M5 11a7 7 0 0 0 14 0" />
                    <path d="M12 18v3" />
                  </svg>
                  <span className={styles.actionLabel}>{isListening ? "Listening" : "Voice"}</span>
                </button>

                <button
                  type="submit"
                  className={styles.submitButton}
                >
                  <span>Start</span>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14" />
                    <path d="m12 5 7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="application/pdf,.pdf,text/plain,.txt,image/*"
              multiple
              onChange={handleFilesSelected}
            />
          </form>

          {(speechError || submitMessage) && (
            <div className={styles.ghostwriterMessage}>
              {speechError || submitMessage}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
