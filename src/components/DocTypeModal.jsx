import React, { useEffect, useMemo, useState } from "react";

import { useDocType } from "../state/docType.js";

const DESCRIPTIONS = {
  charter: "Summarize project scope, objectives, and stakeholders.",
  ddp: "Track requirements, design details, and implementation plans.",
};

export default function DocTypeModal({ open, onConfirm, onCancel }) {
  const {
    metadataList,
    docType,
    suggested,
    confidence,
    defaultDocType,
  } = useDocType();

  const recommendedType = suggested?.type;
  const effectiveDefault = useMemo(() => {
    if (recommendedType) {
      return recommendedType;
    }
    if (docType) {
      return docType;
    }
    return defaultDocType;
  }, [defaultDocType, recommendedType, docType]);

  const [selected, setSelected] = useState(effectiveDefault);

  useEffect(() => {
    if (open) {
      setSelected(effectiveDefault);
    }
  }, [effectiveDefault, open]);

  if (!open) {
    return null;
  }

  const handleConfirm = () => {
    const nextValue = selected || defaultDocType;
    if (typeof onConfirm === "function") {
      onConfirm(nextValue);
    }
  };

  const options = useMemo(() => {
    if (!Array.isArray(metadataList) || metadataList.length === 0) {
      return [];
    }
    return metadataList.map((entry) => ({
      value: entry.type,
      label: entry.label || entry.type,
      description: DESCRIPTIONS[entry.type] || "",
    }));
  }, [metadataList]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900 dark:text-slate-100">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          What document are you creating?
        </h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Choose a template so I can tailor extraction and previews.
        </p>
        <div className="mt-4 space-y-3">
          {options.map((option) => {
            const isActive = selected === option.value;
            const isRecommended = option.value === recommendedType;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setSelected(option.value)}
                className={`w-full rounded-xl border px-4 py-3 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${
                    isActive
                      ? "border-indigo-500 bg-indigo-50/80 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-500/20 dark:text-indigo-200"
                      : "border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-indigo-400 dark:hover:bg-indigo-500/10"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">{option.label}</div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-300">
                      {option.description}
                    </div>
                    {isRecommended ? (
                      <div className="mt-1 text-[11px] font-medium text-indigo-600 dark:text-indigo-300">
                        Recommended
                        {confidence > 0
                          ? ` (${Math.round(confidence * 100)}% confidence)`
                          : ""}
                      </div>
                    ) : null}
                  </div>
                  <span
                    className={`ml-3 inline-flex h-5 w-5 items-center justify-center rounded-full border ${
                      isActive
                        ? "border-indigo-500 bg-indigo-500 text-white"
                        : "border-slate-300 text-slate-400 dark:border-slate-500"
                    }`}
                    aria-hidden="true"
                  >
                    {isActive ? "✓" : ""}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700/70"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:bg-indigo-500 dark:hover:bg-indigo-400 dark:focus-visible:ring-offset-slate-900"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
