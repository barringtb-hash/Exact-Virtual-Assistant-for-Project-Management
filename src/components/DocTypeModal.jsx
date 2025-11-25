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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm px-4 animate-fade-in">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl dark:bg-slate-900 dark:text-slate-100 animate-fade-in-up border border-slate-200 dark:border-slate-800">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          Select Document Type
        </h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Choose a template to customize extraction and previews.
        </p>
        <div className="mt-5 space-y-3">
          {options.map((option) => {
            const isActive = selected === option.value;
            const isRecommended = option.value === recommendedType;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setSelected(option.value)}
                className={`w-full rounded-lg border px-4 py-4 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${
                    isActive
                      ? "border-indigo-500 bg-indigo-50 shadow-sm dark:border-indigo-400 dark:bg-indigo-950/50"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600 dark:hover:bg-slate-800/80"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className={`text-sm font-semibold ${isActive ? "text-indigo-700 dark:text-indigo-300" : "text-slate-800 dark:text-slate-100"}`}>
                      {option.label}
                    </div>
                    <div className={`mt-1 text-sm ${isActive ? "text-indigo-600/80 dark:text-indigo-400/80" : "text-slate-500 dark:text-slate-400"}`}>
                      {option.description}
                    </div>
                    {isRecommended ? (
                      <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Recommended
                        {confidence > 0
                          ? ` • ${Math.round(confidence * 100)}%`
                          : ""}
                      </div>
                    ) : null}
                  </div>
                  <span
                    className={`ml-4 flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors ${
                      isActive
                        ? "border-indigo-600 bg-indigo-600 text-white dark:border-indigo-400 dark:bg-indigo-400"
                        : "border-slate-300 dark:border-slate-600"
                    }`}
                    aria-hidden="true"
                  >
                    {isActive && (
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:border-slate-600"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:bg-indigo-500 dark:hover:bg-indigo-400 dark:focus-visible:ring-offset-slate-900"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
