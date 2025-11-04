import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  createCharterFieldLookup,
  type CharterFormField,
  useCharterFormSchema,
} from "../lib/charter/formSchema.ts";
import {
  conversationActions,
  useConversationSchema,
  useConversationState,
} from "../state/conversationStore.ts";
import type { ConversationFieldState } from "../state/conversationMachine.ts";

interface FinalizeChecklistIssue {
  code: string;
  message: string;
  severity: string;
  ruleText: string | null;
  details?: Record<string, unknown> | null;
}

interface FinalizeChecklistItem {
  id: string;
  label: string;
  required: boolean;
  status: string;
  skippedReason: string | null;
  missingRequired: boolean;
  normalizedValue: unknown;
  displayValue: string;
  issues: FinalizeChecklistIssue[];
}

interface FinalizeDocumentInfo {
  id: string | null;
  name: string | null;
  url: string | null;
}

interface FinalizePdfInfo {
  base64: string;
  contentType: string;
  filename: string;
  size?: number;
}

interface FinalizeResponsePayload {
  ok: boolean;
  charter: Record<string, unknown>;
  checklist: FinalizeChecklistItem[];
  document: FinalizeDocumentInfo | null;
  pdf?: FinalizePdfInfo | null;
  error?: string;
}

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function decodeBase64ToBytes(base64: string): Uint8Array | null {
  if (typeof base64 !== "string" || !base64) {
    return null;
  }
  try {
    if (typeof atob === "function") {
      const binary = atob(base64);
      const length = binary.length;
      const bytes = new Uint8Array(length);
      for (let index = 0; index < length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      return bytes;
    }
  } catch (error) {
    // ignore and fall back to data URL handling
  }
  return null;
}

function createPdfUrl(base64: string, contentType: string): string | null {
  const bytes = decodeBase64ToBytes(base64);
  if (bytes && typeof Blob !== "undefined") {
    try {
      const blob = new Blob([bytes], { type: contentType || "application/pdf" });
      if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
        return URL.createObjectURL(blob);
      }
    } catch (error) {
      // fall through to data URL
    }
  }
  if (!base64) {
    return null;
  }
  return `data:${contentType || "application/pdf"};base64,${base64}`;
}

function getStatusLabel(fieldState: ConversationFieldState): string {
  switch (fieldState.status) {
    case "confirmed":
      return "Confirmed";
    case "skipped":
      return "Skipped";
    case "captured":
      return "Captured";
    default:
      return "Pending";
  }
}

function getProgress(state: ReturnType<typeof useConversationState>): {
  completed: number;
  total: number;
} {
  const total = state?.fieldOrder.length ?? 0;
  if (!state || total === 0) {
    return { completed: 0, total: 0 };
  }
  const completed = state.fieldOrder.reduce((count, fieldId) => {
    const fieldState = state.fields[fieldId];
    if (!fieldState) return count;
    if (fieldState.status === "confirmed" || fieldState.status === "skipped") {
      return count + 1;
    }
    return count;
  }, 0);
  return { completed, total };
}

function FieldPrompt({
  field,
  draft,
  setDraft,
  onSubmit,
  onSkip,
  error,
}: {
  field: CharterFormField;
  draft: string;
  setDraft: (value: string) => void;
  onSubmit: () => void;
  onSkip: () => void;
  error: string | null;
}) {
  const handleSubmit: React.FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <form className="space-y-3" onSubmit={handleSubmit}>
      <div>
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">
          {field.label}
        </h3>
        {field.help_text ? (
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{field.help_text}</p>
        ) : null}
        {field.placeholder ? (
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Example: {field.placeholder}</p>
        ) : null}
      </div>
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        rows={4}
        className={classNames(
          "w-full rounded-xl border bg-white/90 px-3 py-2 text-sm shadow-sm dark:bg-slate-900/40",
          error
            ? "border-red-300 text-red-700 focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400 dark:border-red-500/60 dark:text-red-200"
            : "border-slate-200 text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 dark:border-slate-600/60 dark:text-slate-100",
        )}
        placeholder={`Share details for ${field.label.toLowerCase()}`}
        aria-label={field.label}
      />
      {error ? <div className="text-sm text-red-600 dark:text-red-300">{error}</div> : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
        >
          Save response
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="inline-flex items-center justify-center rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-600/60 dark:text-slate-200 dark:hover:bg-slate-800/60"
        >
          Skip field
        </button>
      </div>
    </form>
  );
}

export function CharterFieldSession({ className }: { className?: string }) {
  const { schema: liveSchema } = useCharterFormSchema();
  const storedSchema = useConversationSchema();
  const schema = liveSchema ?? storedSchema;
  const state = useConversationState();
  const [draft, setDraft] = useState("");
  const [finalizeStatus, setFinalizeStatus] = useState<
    "idle" | "pending" | "success" | "error"
  >("idle");
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const [finalizeResult, setFinalizeResult] =
    useState<FinalizeResponsePayload | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const pdfUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (liveSchema) {
      const session = conversationActions.ensureSession(liveSchema);
      if (session.step === "INIT") {
        conversationActions.dispatch({ type: "INIT" });
      }
    }
  }, [liveSchema]);

  const lookup = useMemo(
    () => (schema ? createCharterFieldLookup(schema) : null),
    [schema],
  );

  const currentField = useMemo(() => {
    if (!state?.currentFieldId || !lookup) {
      return null;
    }
    return lookup.get(state.currentFieldId) ?? null;
  }, [lookup, state?.currentFieldId]);

  const currentFieldState: ConversationFieldState | null = useMemo(() => {
    if (!state || !state.currentFieldId) {
      return null;
    }
    return state.fields[state.currentFieldId] ?? null;
  }, [state]);

  const currentIssue = useMemo(() => {
    const issues = currentFieldState?.issues ?? [];
    if (!issues.length) {
      return null;
    }
    return issues.find((issue) => issue.severity === "error") ?? issues[0] ?? null;
  }, [currentFieldState?.issues]);

  const errorMessage = useMemo(() => {
    if (!currentIssue) {
      return null;
    }
    if (currentIssue.ruleText) {
      return `${currentIssue.message} ${currentIssue.ruleText}`.trim();
    }
    return currentIssue.message;
  }, [currentIssue]);

  useEffect(() => {
    if (!currentFieldState) {
      setDraft("");
      return;
    }
    setDraft(currentFieldState.value ?? "");
  }, [currentFieldState?.value, currentFieldState?.id]);

  useEffect(() => {
    if (pdfUrlRef.current && pdfUrlRef.current.startsWith("blob:")) {
      if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(pdfUrlRef.current);
      }
    }
    pdfUrlRef.current = pdfUrl ?? null;
    return () => {
      if (pdfUrlRef.current && pdfUrlRef.current.startsWith("blob:")) {
        if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
          URL.revokeObjectURL(pdfUrlRef.current);
        }
      }
      pdfUrlRef.current = null;
    };
  }, [pdfUrl]);

  if (!schema || schema.document_type !== "charter") {
    return null;
  }

  if (!state) {
    return null;
  }

  const { completed, total } = getProgress(state);
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  const handleSubmit = () => {
    conversationActions.capture(draft);
  };

  const handleSkip = () => {
    conversationActions.skip("user-skipped");
    conversationActions.nextField();
  };

  const handleConfirm = () => {
    conversationActions.confirm();
  };

  const handleNext = () => {
    conversationActions.nextField();
  };

  const handlePreview = () => {
    conversationActions.preview();
  };

  const handleEndReview = () => {
    conversationActions.endReview();
  };

  const finalizeChecklistMap = useMemo(() => {
    const items = finalizeResult?.checklist ?? [];
    return new Map(items.map((item) => [item.id, item]));
  }, [finalizeResult?.checklist]);

  const handleFinalize = useCallback(async () => {
    if (!state || !schema) {
      return;
    }
    if (finalizeStatus === "pending") {
      return;
    }
    setFinalizeStatus("pending");
    setFinalizeError(null);
    try {
      const response = await fetch("/api/charter/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation: state,
          schemaVersion: schema.version,
          exportPdf: true,
        }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to finalize charter");
      }
      const payload: FinalizeResponsePayload = await response.json();
      if (!payload?.ok) {
        throw new Error(payload?.error || "Failed to finalize charter");
      }
      setFinalizeResult(payload);
      const nextPdfUrl = payload?.pdf?.base64
        ? createPdfUrl(payload.pdf.base64, payload.pdf.contentType)
        : null;
      setPdfUrl(nextPdfUrl);
      conversationActions.finalize();
      setFinalizeStatus("success");
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Failed to finalize charter";
      setFinalizeStatus("error");
      setFinalizeError(message);
    }
  }, [schema, state, finalizeStatus]);

  const handleBack = () => {
    conversationActions.back();
  };

  const renderFinalizeSummary = () => {
    if (!finalizeResult) {
      return null;
    }
    const documentLink = finalizeResult.document?.url ?? null;
    const pdfLink = finalizeResult.pdf && pdfUrl ? pdfUrl : null;
    const missingRequiredCount = finalizeResult.checklist
      ? finalizeResult.checklist.filter((item) => item.missingRequired).length
      : 0;

    return (
      <div className="space-y-2 rounded-xl border border-emerald-200/80 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 shadow-sm dark:border-emerald-500/60 dark:bg-emerald-900/30 dark:text-emerald-200">
        <div className="font-semibold">Charter ready</div>
        {documentLink ? (
          <a
            href={documentLink}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-sm font-medium text-emerald-800 underline transition hover:text-emerald-600 dark:text-emerald-200 dark:hover:text-emerald-100"
          >
            Open Google Doc
          </a>
        ) : (
          <p className="text-sm">Document link unavailable.</p>
        )}
        {pdfLink && finalizeResult.pdf ? (
          <a
            href={pdfLink}
            download={finalizeResult.pdf.filename || "project_charter.pdf"}
            className="block text-sm font-medium text-emerald-800 underline transition hover:text-emerald-600 dark:text-emerald-200 dark:hover:text-emerald-100"
          >
            Download PDF
          </a>
        ) : null}
        <p className="text-xs text-emerald-800 dark:text-emerald-100">
          {missingRequiredCount > 0
            ? `${missingRequiredCount} required field${missingRequiredCount === 1 ? "" : "s"} still need attention.`
            : "All required fields are captured."}
        </p>
      </div>
    );
  };

  const renderReview = () => {
    const items = state.fieldOrder.map((fieldId) => {
      const field = lookup?.get(fieldId) ?? null;
      const fieldState = state.fields[fieldId];
      const statusLabel = getStatusLabel(fieldState);
      const finalizeItem = finalizeChecklistMap.get(fieldId) ?? null;
      const value =
        finalizeItem?.displayValue ||
        fieldState.confirmedValue ||
        fieldState.value ||
        "—";
      const missingRequired =
        finalizeItem?.missingRequired ||
        Boolean(field?.required && fieldState.status === "skipped");
      return (
        <li
          key={fieldId}
          className="rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2 text-sm shadow-sm dark:border-slate-700/60 dark:bg-slate-900/50"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-slate-800 dark:text-slate-100">
              {field?.label ?? fieldId}
            </span>
            <span className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {statusLabel}
            </span>
          </div>
          <div className="mt-1 text-sm text-slate-700 dark:text-slate-200 break-words whitespace-pre-wrap">
            {value || "No response yet."}
          </div>
          {missingRequired ? (
            <div className="mt-2 inline-flex items-center rounded-md bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700 dark:bg-red-900/40 dark:text-red-200">
              Required field missing
            </div>
          ) : null}
          {(fieldState.status === "confirmed" || fieldState.status === "captured") && (
            <button
              type="button"
              onClick={() => {
                conversationActions.endReview();
                conversationActions.edit(fieldId);
              }}
              className="mt-2 text-xs font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-300"
            >
              Edit field
            </button>
          )}
        </li>
      );
    });

    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Review the captured responses before finalizing your charter.
        </p>
        {renderFinalizeSummary()}
        <ul className="space-y-2">{items}</ul>
        {finalizeError ? (
          <div className="text-sm text-red-600 dark:text-red-300">{finalizeError}</div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleEndReview}
            className="inline-flex items-center justify-center rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-600/60 dark:text-slate-200 dark:hover:bg-slate-800/60"
          >
            Continue editing
          </button>
          <button
            type="button"
            onClick={handleFinalize}
            disabled={finalizeStatus === "pending"}
            className={classNames(
              "inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 dark:bg-emerald-500",
              finalizeStatus === "pending"
                ? "cursor-not-allowed opacity-70"
                : "hover:bg-emerald-500 dark:hover:bg-emerald-400"
            )}
          >
            {finalizeStatus === "pending" ? "Finalizing…" : "Finalize charter"}
          </button>
        </div>
      </div>
    );
  };

  const renderFinalized = () => (
    <div className="space-y-3">
      <p className="text-sm text-slate-700 dark:text-slate-200">
        Charter conversation finalized on {state.finalizedAt ? new Date(state.finalizedAt).toLocaleString() : "this session"}.
      </p>
      {renderFinalizeSummary()}
      <p className="text-sm text-slate-600 dark:text-slate-300">
        You can still edit individual fields from the review list if needed.
      </p>
      <button
        type="button"
        onClick={handlePreview}
        className="inline-flex items-center justify-center rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-600/60 dark:text-slate-200 dark:hover:bg-slate-800/60"
      >
        Re-open review
      </button>
    </div>
  );

  const renderConversation = () => {
    if (!currentField || !currentFieldState) {
      return (
        <div className="text-sm text-slate-600 dark:text-slate-300">
          All charter fields are complete. Preview to confirm everything looks correct.
        </div>
      );
    }

    switch (state.step) {
      case "ASK":
      case "CAPTURE":
      case "VALIDATE":
        return (
          <FieldPrompt
            field={currentField}
            draft={draft}
            setDraft={setDraft}
            onSubmit={handleSubmit}
            onSkip={handleSkip}
            error={errorMessage}
          />
        );
      case "CONFIRM":
        return (
          <div className="space-y-3">
            <div>
              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">
                Confirm response for {currentField.label}
              </h3>
              <div className="mt-2 rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2 text-sm text-slate-700 shadow-sm dark:border-slate-600/60 dark:bg-slate-900/40 dark:text-slate-200">
                {currentFieldState.value || "No response provided."}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleConfirm}
                className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
              >
                Confirm value
              </button>
              <button
                type="button"
                onClick={() => conversationActions.edit(currentField.id)}
                className="inline-flex items-center justify-center rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-600/60 dark:text-slate-200 dark:hover:bg-slate-800/60"
              >
                Edit response
              </button>
            </div>
          </div>
        );
      case "NEXT_FIELD":
        return (
          <div className="space-y-3">
            <div className="rounded-xl border border-emerald-200/80 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 shadow-sm dark:border-emerald-500/60 dark:bg-emerald-900/40 dark:text-emerald-200">
              Saved {currentField.label}. Continue to the next field or open the review summary.
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleNext}
                className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
              >
                Next field
              </button>
              <button
                type="button"
                onClick={handlePreview}
                className="inline-flex items-center justify-center rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-600/60 dark:text-slate-200 dark:hover:bg-slate-800/60"
              >
                Preview progress
              </button>
            </div>
          </div>
        );
      default:
        return (
          <div className="text-sm text-slate-600 dark:text-slate-300">
            Select a field to continue.
          </div>
        );
    }
  };

  return (
    <section
      className={classNames(
        "rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/40",
        "max-h-72 overflow-y-auto",
        className,
      )}
      data-mode={state.mode}
      aria-live="polite"
    >
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
            Charter wizard
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Step through each required field to build your charter.
          </p>
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400">
          {completed} of {total} fields • {percent}% complete
        </div>
      </header>
      <div className="space-y-4">
        {state.mode === "review"
          ? renderReview()
          : state.mode === "finalized"
          ? renderFinalized()
          : renderConversation()}
      </div>
      <footer className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
        <button
          type="button"
          onClick={handleBack}
          className="rounded-lg border border-slate-200 px-2 py-1 transition hover:bg-slate-100 dark:border-slate-600/60 dark:hover:bg-slate-800/60"
        >
          Back
        </button>
        <button
          type="button"
          onClick={handlePreview}
          className="rounded-lg border border-slate-200 px-2 py-1 transition hover:bg-slate-100 dark:border-slate-600/60 dark:hover:bg-slate-800/60"
        >
          Preview
        </button>
        <button
          type="button"
          onClick={handleFinalize}
          disabled={finalizeStatus === "pending"}
          className={classNames(
            "rounded-lg border border-slate-200 px-2 py-1 transition dark:border-slate-600/60",
            finalizeStatus === "pending"
              ? "cursor-not-allowed opacity-70"
              : "hover:bg-slate-100 dark:hover:bg-slate-800/60"
          )}
        >
          {finalizeStatus === "pending" ? "Finalizing…" : "Finalize"}
        </button>
      </footer>
    </section>
  );
}

export default CharterFieldSession;
