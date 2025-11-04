import React, { useEffect, useMemo, useState } from "react";

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

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
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

  useEffect(() => {
    if (liveSchema) {
      conversationActions.ensureSession(liveSchema);
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

  useEffect(() => {
    if (!currentFieldState) {
      setDraft("");
      return;
    }
    setDraft(currentFieldState.value ?? "");
  }, [currentFieldState?.value, currentFieldState?.id]);

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

  const handleFinalize = () => {
    conversationActions.finalize();
  };

  const handleBack = () => {
    conversationActions.back();
  };

  const renderReview = () => {
    const items = state.fieldOrder.map((fieldId) => {
      const field = lookup?.get(fieldId) ?? null;
      const fieldState = state.fields[fieldId];
      const statusLabel = getStatusLabel(fieldState);
      const value = fieldState.confirmedValue || fieldState.value || "—";
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
        <ul className="space-y-2">{items}</ul>
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
            className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 dark:bg-emerald-500 dark:hover:bg-emerald-400"
          >
            Finalize charter
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
            error={currentFieldState.error}
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
          className="rounded-lg border border-slate-200 px-2 py-1 transition hover:bg-slate-100 dark:border-slate-600/60 dark:hover:bg-slate-800/60"
        >
          Finalize
        </button>
      </footer>
    </section>
  );
}

export default CharterFieldSession;
