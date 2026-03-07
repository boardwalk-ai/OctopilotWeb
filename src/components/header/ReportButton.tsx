"use client";

import { useEffect, useMemo, useState } from "react";
import { AuthService } from "@/services/AuthService";
import { OctopilotAPIService } from "@/services/OctopilotAPIService";

type ViewState = "form" | "loading" | "success";

type MeResponse = {
  id: string;
  email: string | null;
};

export default function ReportButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [viewState, setViewState] = useState<ViewState>("form");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => title.trim().length > 0 && content.trim().length > 0, [title, content]);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(file);
    setPreviewUrl(nextPreviewUrl);

    return () => {
      URL.revokeObjectURL(nextPreviewUrl);
    };
  }, [file]);

  const resetState = () => {
    setViewState("form");
    setTitle("");
    setContent("");
    setFile(null);
    setPreviewUrl(null);
    setError(null);
  };

  const handleClose = () => {
    setIsOpen(false);
    window.setTimeout(() => {
      resetState();
    }, 180);
  };

  const handleSubmit = async () => {
    if (!canSubmit) {
      setError("Issue title and issue content are required.");
      return;
    }

    setError(null);
    setViewState("loading");

    try {
      const currentUser = AuthService.getCurrentUser();
      if (!currentUser?.email) {
        throw new Error("You need to be signed in before reporting an issue.");
      }

      const me = await OctopilotAPIService.get<MeResponse>("/api/v1/me");

      let imageUrl: string | null = null;
      if (file) {
        const authorization = await AuthService.getAuthorizationHeader();
        const formData = new FormData();
        formData.append("file", file);

        const uploadResponse = await fetch("/backend/api/v1/reports/upload-image", {
          method: "POST",
          headers: authorization ? { Authorization: authorization } : undefined,
          body: formData,
        });

        const uploadPayload = await uploadResponse.json();
        if (!uploadResponse.ok) {
          throw new Error(uploadPayload.detail || uploadPayload.error || "Failed to upload screenshot.");
        }
        imageUrl = uploadPayload.imageUrl || null;
      }

      await OctopilotAPIService.post("/api/v1/reports", {
        email: currentUser.email,
        title: title.trim(),
        description: content.trim(),
        image_url: imageUrl,
        user_id: me.id,
      });

      setViewState("success");
      window.setTimeout(() => {
        handleClose();
      }, 2200);
    } catch (submitError) {
      setViewState("form");
      setError(submitError instanceof Error ? submitError.message : "Failed to submit report.");
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex flex-col items-center gap-0.5 rounded-lg px-2 py-1 text-white/30 transition hover:text-white/60"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4" />
          <path d="M12 16h.01" />
        </svg>
        <span className="text-[10px] leading-tight">Report a problem</span>
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/72 px-4 py-6">
          <div className="w-full max-w-[640px] rounded-[30px] border border-white/10 bg-[#090909] p-7 shadow-[0_32px_80px_rgba(0,0,0,0.55)]">
            {viewState === "form" ? (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/36">Issue Report</p>
                    <h2 className="mt-3 text-[2rem] font-semibold tracking-[-0.05em] text-white">Report a problem</h2>
                  </div>
                  <button
                    onClick={handleClose}
                    className="rounded-full border border-white/10 bg-[#141414] px-4 py-2.5 text-sm text-white/72 transition hover:border-red-500/35 hover:text-white"
                  >
                    Close
                  </button>
                </div>

                <div className="mt-7 space-y-5">
                  <div>
                    <label className="mb-3 block text-sm font-medium text-white/85">Please send us the screenshot of your issue:</label>
                    <label className="flex min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-[24px] border border-dashed border-white/15 bg-[#101010] px-5 py-6 text-center transition hover:border-red-500/35 hover:bg-[#121212]">
                      {previewUrl ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={previewUrl} alt="Issue preview" className="max-h-[180px] rounded-[18px] object-contain" />
                          <span className="mt-4 text-xs text-white/45">Click to replace screenshot</span>
                        </>
                      ) : (
                        <>
                          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-[#171717] text-white/62">
                            <UploadIcon />
                          </div>
                          <div className="mt-4 text-sm font-medium text-white/78">Single image upload</div>
                          <div className="mt-1 text-xs text-white/42">Optional. PNG, JPG, WEBP or HEIC.</div>
                        </>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(event) => setFile(event.target.files?.[0] || null)}
                      />
                    </label>
                  </div>

                  <div>
                    <label className="mb-3 block text-sm font-medium text-white/85">Tell us what issue are you facing:</label>
                    <input
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder="Issue title"
                      className="w-full rounded-[18px] border border-white/10 bg-[#121212] px-4 py-3 text-sm text-white outline-none transition focus:border-red-500/40"
                    />
                  </div>

                  <div>
                    <label className="mb-3 block text-sm font-medium text-white/85">Describe your issue:</label>
                    <textarea
                      value={content}
                      onChange={(event) => setContent(event.target.value)}
                      placeholder="Issue content"
                      rows={6}
                      className="w-full resize-none rounded-[18px] border border-white/10 bg-[#121212] px-4 py-3 text-sm text-white outline-none transition focus:border-red-500/40"
                    />
                  </div>

                  {error ? <div className="rounded-[18px] border border-red-500/25 bg-[#140b0b] px-4 py-3 text-sm text-red-100">{error}</div> : null}

                  <div className="flex items-center justify-end gap-3">
                    <button
                      onClick={handleClose}
                      className="rounded-full border border-white/10 bg-[#141414] px-5 py-3 text-sm font-semibold text-white/72 transition hover:border-white/20 hover:text-white"
                    >
                      Close
                    </button>
                    <button
                      onClick={handleSubmit}
                      className="rounded-full bg-red-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-white hover:text-red-500"
                    >
                      Submit
                    </button>
                  </div>
                </div>
              </>
            ) : null}

            {viewState === "loading" ? (
              <div className="flex min-h-[420px] flex-col items-center justify-center text-center">
                <div className="relative h-20 w-20">
                  <span className="absolute inset-0 rounded-full border border-red-500/20" />
                  <span className="absolute inset-2 rounded-full border-2 border-transparent border-t-red-500 border-r-red-400 animate-spin" />
                  <span className="absolute inset-[18px] rounded-full bg-red-500/12" />
                </div>
                <h3 className="mt-8 text-[1.4rem] font-semibold tracking-[-0.04em] text-white">Sending your report</h3>
                <p className="mt-3 max-w-[360px] text-sm leading-7 text-white/48">We are packaging your issue details and screenshot for the support team.</p>
              </div>
            ) : null}

            {viewState === "success" ? (
              <div className="flex min-h-[420px] flex-col items-center justify-center text-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-full border border-emerald-400/25 bg-emerald-500/10">
                  <SuccessIcon />
                </div>
                <h3 className="mt-8 text-[1.4rem] font-semibold tracking-[-0.04em] text-white">Issue submitted</h3>
                <p className="mt-3 max-w-[440px] text-sm leading-7 text-white/54">
                  Your issue has been submitted successfully. We will notify you shortly once the issue is solved by our team. Thanks for trusting Octopilot.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

function UploadIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M4 20h16" />
    </svg>
  );
}

function SuccessIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-300">
      <path d="m5 12 4.5 4.5L19 7" />
    </svg>
  );
}
