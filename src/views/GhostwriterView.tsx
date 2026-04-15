"use client";

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Sora } from "next/font/google";
import {
  AppHeader,
  BackToHome,
  MainHeaderActions,
} from "@/components/header";
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

function getGreetingLabel() {
  return "Hello, writer";
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
  const [prompt, setPrompt] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [sourceSearchEnabled, setSourceSearchEnabled] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [speechError, setSpeechError] = useState("");
  const [submitMessage, setSubmitMessage] = useState("");
  const greeting = getGreetingLabel();

  useEffect(() => {
    return () => {
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
            Bring rough ideas, source files, or a spoken brief. Ghostwriter shapes the next draft in your voice.
          </p>

          <form className={styles.ghostwriterComposer} onSubmit={handleSubmit}>
            <textarea
              value={prompt}
              onChange={(event) => {
                setPrompt(event.target.value);
                setSubmitMessage("");
              }}
              placeholder="What do you want Ghostwriter to write or revise?"
              className={styles.ghostwriterInput}
              rows={5}
            />

            {attachments.length > 0 && (
              <div className={styles.attachmentList}>
                {attachments.map((file, index) => (
                  <div key={`${file.name}-${file.size}-${index}`} className={styles.attachmentChip}>
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
                  <span className={styles.actionLabel}>Globe</span>
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

          <div className={styles.ghostwriterStatusRow}>
            <span className={styles.statusPill}>
              {sourceSearchEnabled ? "Source search enabled" : "Source search off"}
            </span>
            <span className={styles.statusPill}>
              {attachments.length} attachment{attachments.length === 1 ? "" : "s"}
            </span>
            <span className={styles.statusPill}>
              Free browser STT
            </span>
          </div>

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
