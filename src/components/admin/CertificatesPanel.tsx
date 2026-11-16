"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import { AuthService } from "@/services/AuthService";

type CertificateStatus = "valid" | "revoked";

type Certificate = {
  id: string;
  serial: number;
  recipientName: string;
  title: string;
  description: string;
  program: string;
  periodStart: string | null;
  periodEnd: string | null;
  issuedOn: string;
  signerName: string;
  signerTitle: string;
  imageUrl: string | null;
  status: CertificateStatus;
  revokedReason: string | null;
  revokedAt: string | null;
  createdBy: string | null;
  createdAt: string;
};

type FormState = {
  recipientName: string;
  title: string;
  description: string;
  program: string;
  periodStart: string;
  periodEnd: string;
  issuedOn: string;
  signerName: string;
  signerTitle: string;
};

const EMPTY_FORM: FormState = {
  recipientName: "",
  title: "",
  description: "",
  program: "OctoPilot AI Student Ambassador Program",
  periodStart: "",
  periodEnd: "",
  issuedOn: "",
  signerName: "Hein Htet",
  signerTitle: "Founder and Project Manager",
};

const VERIFY_BASE = "https://octopilotai.app/verify/";
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/png", "image/jpeg"];

async function getToken(forceRefresh: boolean) {
  const token = await AuthService.getIdToken(forceRefresh);
  if (!token) throw new Error("You need to be signed in as an admin.");
  return token;
}

async function readError(response: Response, fallback: string) {
  const payload = await response.json().catch(() => ({}));
  return typeof payload.error === "string" ? payload.error : fallback;
}

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const performFetch = async (forceRefresh: boolean) =>
    fetch(path, {
      ...init,
      headers: {
        Authorization: `Bearer ${await getToken(forceRefresh)}`,
        Accept: "application/json",
        ...(typeof init?.body === "string" ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers || {}),
      },
    });

  let response = await performFetch(false);
  if (response.status === 401) response = await performFetch(true);
  if (!response.ok) throw new Error(await readError(response, "Admin request failed."));
  return (await response.json()) as T;
}

/** Checks a picked file before it is sent, so obvious mistakes fail instantly. */
function checkImageFile(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) return `${file.name} is not a PNG or JPEG.`;
  if (file.size > MAX_UPLOAD_BYTES) return `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is 10 MB.`;
  if (file.size === 0) return `${file.name} is empty.`;
  return null;
}

function toForm(cert: Certificate): FormState {
  return {
    recipientName: cert.recipientName,
    title: cert.title,
    description: cert.description,
    program: cert.program,
    periodStart: cert.periodStart ?? "",
    periodEnd: cert.periodEnd ?? "",
    issuedOn: cert.issuedOn,
    signerName: cert.signerName,
    signerTitle: cert.signerTitle,
  };
}

const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400";
const quietButton = `rounded-full px-3 py-1.5 text-xs text-white/70 transition-colors hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-55 ${focusRing}`;
const outlineButton = `rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/80 transition-colors hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-55 ${focusRing}`;

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
  wide,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  wide?: boolean;
  multiline?: boolean;
}) {
  return (
    <label className={`block rounded-[20px] border border-white/8 bg-[#151515] px-4 py-3 ${wide ? "md:col-span-2" : ""}`}>
      <span className="block text-[11px] font-semibold text-white/45">
        {label}
        {required ? <span className="text-red-300"> *</span> : null}
      </span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          rows={3}
          className="mt-2 w-full resize-y bg-transparent text-sm leading-6 text-white outline-none placeholder:text-white/22"
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          required={required}
          className="mt-2 w-full bg-transparent text-sm text-white outline-none placeholder:text-white/22 [color-scheme:dark]"
        />
      )}
    </label>
  );
}

type StatusAction = "revoke" | "restore";

/**
 * Confirms a revoke or restore. Revoking is public (the verify page changes for
 * anyone holding the link), so it asks for the 6-digit serial to be typed first.
 */
function ConfirmStatusDialog({
  cert,
  action,
  busy,
  onCancel,
  onConfirm,
}: {
  cert: Certificate;
  action: StatusAction;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason: string | null) => Promise<void>;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [dialogError, setDialogError] = useState<string | null>(null);
  const serial = cert.id.slice(-6);
  const isRevoke = action === "revoke";
  const canConfirm = !busy && (!isRevoke || typed.trim() === serial);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus(); // the safe choice has focus, so Enter never revokes by accident
    return () => previouslyFocused?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  const submit = async () => {
    if (!canConfirm) return;
    setDialogError(null);
    try {
      await onConfirm(isRevoke ? reason.trim() || null : null);
    } catch (error) {
      setDialogError(error instanceof Error ? error.message : "Could not update the certificate.");
    }
  };

  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="status-dialog-title"
        aria-describedby="status-dialog-desc"
        className="w-full max-w-lg rounded-[26px] border border-white/10 bg-[#101010]"
      >
        <div className="border-b border-white/8 px-5 py-4">
          <div id="status-dialog-title" className="text-base font-semibold text-white">
            {isRevoke ? "Revoke this certificate?" : "Restore this certificate?"}
          </div>
          <div className="mt-1 text-sm text-white/60">
            {cert.recipientName} <span className="font-mono text-xs text-white/40">{cert.id}</span>
          </div>
        </div>

        <div className="space-y-4 px-5 py-4 text-sm leading-6">
          <p id="status-dialog-desc" className="text-white/70">
            {isRevoke
              ? "Anyone who opens this certificate's verify link will see it as revoked, and its Add to LinkedIn and Download PDF buttons disappear. You can restore it later."
              : "The verify page will show this certificate as valid again, with its Add to LinkedIn and Download PDF buttons."}
          </p>

          {isRevoke ? (
            <>
              <label className="block rounded-[18px] border border-white/8 bg-[#151515] px-4 py-3">
                <span className="block text-[11px] font-semibold text-white/45">Reason (optional, shown publicly on the verify page)</span>
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  rows={2}
                  maxLength={300}
                  disabled={busy}
                  placeholder="Issued by mistake"
                  className="mt-2 w-full resize-y bg-transparent text-sm text-white outline-none placeholder:text-white/22"
                />
              </label>
              <label className="block rounded-[18px] border border-white/8 bg-[#151515] px-4 py-3">
                <span className="block text-[11px] font-semibold text-white/45">
                  Type <span className="font-mono text-white/80">{serial}</span> to confirm
                </span>
                <input
                  value={typed}
                  onChange={(event) => setTyped(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void submit();
                  }}
                  inputMode="numeric"
                  autoComplete="off"
                  disabled={busy}
                  aria-label={`Type ${serial} to confirm`}
                  className="mt-2 w-full bg-transparent font-mono text-sm tracking-[0.2em] text-white outline-none placeholder:text-white/22"
                  placeholder="000000"
                />
              </label>
            </>
          ) : null}

          {dialogError ? (
            <p role="alert" className="rounded-[14px] border border-red-500/25 bg-[#140b0b] px-4 py-3 text-red-100">
              {dialogError}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-white/8 px-5 py-4">
          <button ref={cancelRef} type="button" onClick={onCancel} disabled={busy} className={outlineButton}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canConfirm}
            aria-busy={busy || undefined}
            className={`min-h-9 rounded-full px-4 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${focusRing} ${
              isRevoke ? "bg-red-600 text-white hover:bg-red-500" : "bg-white text-black hover:bg-white/85"
            }`}
          >
            {busy ? (isRevoke ? "Revoking…" : "Restoring…") : isRevoke ? "Revoke certificate" : "Restore certificate"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Full-screen viewer for one certificate image, with replace and delete. */
function ImageViewer({
  cert,
  busy,
  onClose,
  onReplace,
  onDelete,
}: {
  cert: Certificate;
  busy: "upload" | "delete" | null;
  onClose: () => void;
  onReplace: (file: File) => void;
  onDelete: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // On open: focus the dialog and lock page scroll; on close: give focus back.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      previouslyFocused?.focus();
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const pick = (file: File | undefined) => {
    if (file) onReplace(file);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (!busy) pick(event.dataTransfer.files?.[0]);
  };

  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cert-viewer-title"
        tabIndex={-1}
        className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-[26px] border border-white/10 bg-[#101010] outline-none"
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-5 py-4">
          <div className="min-w-0">
            <div id="cert-viewer-title" className="truncate text-sm font-semibold text-white">
              {cert.recipientName}
            </div>
            <div className="font-mono text-xs text-white/45">{cert.id}</div>
          </div>
          <button type="button" onClick={onClose} disabled={!!busy} className={outlineButton} aria-label="Close image viewer">
            Close
          </button>
        </div>

        <div className={`relative min-h-0 flex-1 overflow-auto p-5 ${dragging ? "bg-red-500/5" : ""}`}>
          {!loaded ? <div className="aspect-[1.414] w-full animate-pulse rounded-2xl bg-white/[0.04]" /> : null}
          {cert.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={cert.imageUrl}
              src={cert.imageUrl}
              alt={`Certificate issued to ${cert.recipientName}`}
              onLoad={() => setLoaded(true)}
              onError={() => setLoaded(true)}
              className={`mx-auto max-h-[70vh] w-auto rounded-xl ${loaded ? "" : "hidden"}`}
            />
          ) : null}
          {dragging ? (
            <div className="pointer-events-none absolute inset-5 grid place-items-center rounded-2xl border-2 border-dashed border-red-400/70 text-sm text-white">
              Drop to replace the image
            </div>
          ) : null}
          {busy === "upload" ? (
            <div className="absolute inset-0 grid place-items-center bg-black/60 text-sm text-white" role="status">
              Uploading the new image…
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/8 px-5 py-4">
          {confirmingDelete ? (
            <div className="flex flex-wrap items-center gap-2 text-sm text-white/80" role="alertdialog" aria-label="Confirm delete">
              <span>Delete this image? The verify page will show no picture or PDF until a new one is uploaded.</span>
              <button type="button" onClick={onDelete} disabled={!!busy} className={`${outlineButton} border-red-500/40 text-red-200`}>
                {busy === "delete" ? "Deleting…" : "Yes, delete"}
              </button>
              <button type="button" onClick={() => setConfirmingDelete(false)} disabled={!!busy} className={quietButton}>
                Keep it
              </button>
            </div>
          ) : (
            <>
              <a href={cert.imageUrl ?? "#"} target="_blank" rel="noopener noreferrer" className={quietButton}>
                Open full size
              </a>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setConfirmingDelete(true)} disabled={!!busy} className={quietButton}>
                  Delete image
                </button>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={!!busy}
                  className={`min-h-9 rounded-full bg-red-600 px-4 text-xs font-semibold text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-55 ${focusRing}`}
                >
                  {busy === "upload" ? "Uploading…" : "Replace image"}
                </button>
              </div>
            </>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              pick(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </div>
      </div>
    </div>
  );
}

export default function CertificatesPanel({ refreshKey }: { refreshKey: number }) {
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState<{ id: string; kind: "upload" | "delete" } | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const payload = await adminFetch<{ list: Certificate[] }>("/api/admin/certificates");
      setCertificates(payload.list || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load certificates.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return certificates;
    return certificates.filter((cert) =>
      [cert.id, cert.recipientName, cert.title].some((value) => value.toLowerCase().includes(q)),
    );
  }, [certificates, search]);

  const viewing = certificates.find((cert) => cert.id === viewingId && cert.imageUrl) ?? null;
  const closeViewer = useCallback(() => setViewingId(null), []);
  const [confirming, setConfirming] = useState<{ cert: Certificate; action: StatusAction } | null>(null);
  const closeConfirm = useCallback(() => setConfirming(null), []);

  const replaceRow = (certificate: Certificate) =>
    setCertificates((list) => list.map((item) => (item.id === certificate.id ? certificate : item)));

  const update = (key: keyof FormState) => (value: string) => setForm((current) => ({ ...current, [key]: value }));

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const save = async () => {
    if (!form.recipientName.trim() || !form.title.trim()) {
      setError("Recipient name and contribution title are required.");
      return;
    }
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    const body = JSON.stringify({
      ...form,
      periodStart: form.periodStart || null,
      periodEnd: form.periodEnd || null,
      issuedOn: form.issuedOn || null,
    });
    try {
      if (editingId) {
        const { certificate } = await adminFetch<{ certificate: Certificate }>(
          `/api/admin/certificates/${encodeURIComponent(editingId)}`,
          { method: "PATCH", body },
        );
        replaceRow(certificate);
        setSuccess(`Saved changes to ${certificate.id}.`);
      } else {
        const { certificate } = await adminFetch<{ certificate: Certificate }>("/api/admin/certificates", {
          method: "POST",
          body,
        });
        setCertificates((list) => [certificate, ...list]);
        setSuccess(`Issued ${certificate.id} to ${certificate.recipientName}. Add its image with Upload.`);
      }
      resetForm();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save certificate.");
    } finally {
      setIsSaving(false);
    }
  };

  const uploadImage = async (cert: Certificate, file: File) => {
    const problem = checkImageFile(file);
    if (problem) {
      setError(problem);
      return;
    }
    setImageBusy({ id: cert.id, kind: "upload" });
    setError(null);
    setSuccess(null);
    try {
      const send = async (forceRefresh: boolean) =>
        fetch(`/api/admin/certificates/${encodeURIComponent(cert.id)}/image`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${await getToken(forceRefresh)}`, "Content-Type": file.type, Accept: "application/json" },
          body: file,
        });
      let response = await send(false);
      if (response.status === 401) response = await send(true);
      if (!response.ok) throw new Error(await readError(response, "Upload failed."));
      const { certificate } = (await response.json()) as { certificate: Certificate };
      replaceRow(certificate);
      setSuccess(cert.imageUrl ? `Replaced the image for ${cert.id}.` : `Uploaded the image for ${cert.id}.`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
    } finally {
      setImageBusy(null);
    }
  };

  const deleteImage = async (cert: Certificate) => {
    setImageBusy({ id: cert.id, kind: "delete" });
    setError(null);
    setSuccess(null);
    try {
      const { certificate } = await adminFetch<{ certificate: Certificate }>(
        `/api/admin/certificates/${encodeURIComponent(cert.id)}/image`,
        { method: "DELETE" },
      );
      replaceRow(certificate);
      setViewingId(null);
      setSuccess(`Deleted the image for ${cert.id}. Upload a new one any time.`);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete the image.");
    } finally {
      setImageBusy(null);
    }
  };

  /** Runs after the confirmation dialog; throws so the dialog can show the error in place. */
  const setStatus = async (cert: Certificate, action: StatusAction, reason: string | null) => {
    setBusyId(cert.id);
    setError(null);
    setSuccess(null);
    try {
      const { certificate } = await adminFetch<{ certificate: Certificate }>(
        `/api/admin/certificates/${encodeURIComponent(cert.id)}`,
        { method: "PATCH", body: JSON.stringify({ action, reason }) },
      );
      replaceRow(certificate);
      setConfirming(null);
      setSuccess(action === "revoke" ? `Revoked ${certificate.id}.` : `Restored ${certificate.id}.`);
    } finally {
      setBusyId(null);
    }
  };

  const copyLink = async (id: string) => {
    try {
      await navigator.clipboard.writeText(`${VERIFY_BASE}${id}`);
      setSuccess(`Copied the verify link for ${id}.`);
    } catch {
      setError("Could not copy. Select the link manually.");
    }
  };

  return (
    <div className="space-y-4">
      {error ? (
        <div role="alert" className="rounded-[22px] border border-red-500/25 bg-[#140b0b] px-5 py-4 text-sm text-red-100">
          {error}
        </div>
      ) : null}
      {success ? (
        <div role="status" className="rounded-[22px] border border-emerald-500/25 bg-[#0d1510] px-5 py-4 text-sm text-emerald-100">
          {success}
        </div>
      ) : null}

      <section className="rounded-[26px] border border-white/8 bg-[#101010]">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/8 px-5 py-4">
          <div>
            <div className="text-sm font-semibold text-white">{editingId ? `Editing ${editingId}` : "Issue a certificate"}</div>
            <div className="mt-1 text-sm leading-6 text-white/46">
              Each certificate gets an ID like OCTO-7KQ2MZ4P-000001 and a public page at octopilotai.app/verify. Issue it
              first, put the ID on the design, then upload the image from the table below.
            </div>
          </div>
          {editingId ? (
            <button type="button" onClick={resetForm} className={`rounded-full border border-white/10 px-4 py-2 text-sm text-white/70 transition-colors hover:bg-white/5 hover:text-white ${focusRing}`}>
              Cancel edit
            </button>
          ) : null}
        </div>

        <div className="grid gap-3 p-5 md:grid-cols-2">
          <Field label="Recipient name" value={form.recipientName} onChange={update("recipientName")} placeholder="As printed on the certificate" required />
          <Field label="Contribution title" value={form.title} onChange={update("title")} placeholder="UI Development Contribution" required />
          <Field label="Description" value={form.description} onChange={update("description")} placeholder="In recognition of contributions to…" wide multiline />
          <Field label="Program" value={form.program} onChange={update("program")} wide />
          <Field label="Period start" type="date" value={form.periodStart} onChange={update("periodStart")} />
          <Field label="Period end" type="date" value={form.periodEnd} onChange={update("periodEnd")} />
          <Field label="Issue date (blank = today)" type="date" value={form.issuedOn} onChange={update("issuedOn")} />
          <Field label="Signed by" value={form.signerName} onChange={update("signerName")} />
          <Field label="Signer title" value={form.signerTitle} onChange={update("signerTitle")} wide />
        </div>

        <div className="flex justify-end border-t border-white/8 px-5 py-4">
          <button
            type="button"
            onClick={() => void save()}
            disabled={isSaving}
            aria-busy={isSaving || undefined}
            className={`min-h-11 rounded-full bg-red-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-55 ${focusRing}`}
          >
            {isSaving ? "Saving…" : editingId ? "Save changes" : "Issue certificate"}
          </button>
        </div>
      </section>

      <section className="min-w-0 overflow-hidden rounded-[26px] border border-white/8 bg-[#101010]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-5 py-4">
          <div className="text-sm font-semibold text-white">
            Issued certificates <span className="font-normal text-white/40">({certificates.length})</span>
          </div>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search ID, name or title"
            aria-label="Search certificates"
            className={`w-full max-w-xs rounded-full border border-white/8 bg-[#151515] px-4 py-2 text-sm text-white outline-none placeholder:text-white/25 ${focusRing}`}
          />
        </div>

        {isLoading ? (
          <div className="space-y-2 p-5" aria-label="Loading certificates">
            {[0, 1, 2].map((row) => (
              <div key={row} className="h-12 animate-pulse rounded-2xl bg-white/[0.04]" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-10 text-sm text-white/50">
            {certificates.length === 0
              ? "No certificates yet. Issue the first one above; its ID and verify link appear here."
              : "No certificates match that search."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="text-white/40">
                <tr className="border-b border-white/8">
                  <th className="px-5 py-3 font-medium">ID</th>
                  <th className="px-3 py-3 font-medium">Recipient</th>
                  <th className="px-3 py-3 font-medium">Contribution</th>
                  <th className="px-3 py-3 font-medium">Issued</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 font-medium">Image</th>
                  <th className="px-5 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((cert) => {
                  const rowImageBusy = imageBusy?.id === cert.id ? imageBusy.kind : null;
                  return (
                    <tr key={cert.id} className="border-b border-white/5 last:border-0">
                      <td className="whitespace-nowrap px-5 py-3 font-mono text-[13px] text-white/85">{cert.id}</td>
                      <td className="px-3 py-3 text-white">{cert.recipientName}</td>
                      <td className="px-3 py-3 text-white/60">{cert.title}</td>
                      <td className="whitespace-nowrap px-3 py-3 tabular-nums text-white/60">{cert.issuedOn}</td>
                      <td className="px-3 py-3">
                        {cert.status === "valid" ? (
                          <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-200">Valid</span>
                        ) : (
                          <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs text-amber-200" title={cert.revokedReason ?? undefined}>
                            Revoked
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {cert.imageUrl ? (
                          <button type="button" onClick={() => setViewingId(cert.id)} disabled={!!rowImageBusy} className={outlineButton}>
                            View
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              uploadTargetRef.current = cert.id;
                              uploadInputRef.current?.click();
                            }}
                            disabled={!!rowImageBusy}
                            aria-busy={rowImageBusy === "upload" || undefined}
                            className={`${outlineButton} border-red-500/30`}
                          >
                            {rowImageBusy === "upload" ? "Uploading…" : "Upload"}
                          </button>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-1.5">
                          <a href={`/verify/${cert.id}`} target="_blank" rel="noopener noreferrer" className={quietButton}>
                            Open
                          </a>
                          <button type="button" onClick={() => void copyLink(cert.id)} className={quietButton}>
                            Copy link
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(cert.id);
                              setForm(toForm(cert));
                              setSuccess(null);
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                            className={quietButton}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={busyId === cert.id}
                            onClick={() => setConfirming({ cert, action: cert.status === "valid" ? "revoke" : "restore" })}
                            className={outlineButton}
                          >
                            {busyId === cert.id ? "…" : cert.status === "valid" ? "Revoke" : "Restore"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <input
          ref={uploadInputRef}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
          onChange={(event) => {
            const file = event.target.files?.[0];
            const target = certificates.find((cert) => cert.id === uploadTargetRef.current);
            event.target.value = "";
            uploadTargetRef.current = null;
            if (file && target) void uploadImage(target, file);
          }}
        />
      </section>

      {confirming ? (
        <ConfirmStatusDialog
          cert={confirming.cert}
          action={confirming.action}
          busy={busyId === confirming.cert.id}
          onCancel={closeConfirm}
          onConfirm={(reason) => setStatus(confirming.cert, confirming.action, reason)}
        />
      ) : null}

      {viewing ? (
        <ImageViewer
          cert={viewing}
          busy={imageBusy?.id === viewing.id ? imageBusy.kind : null}
          onClose={closeViewer}
          onReplace={(file) => void uploadImage(viewing, file)}
          onDelete={() => void deleteImage(viewing)}
        />
      ) : null}
    </div>
  );
}
