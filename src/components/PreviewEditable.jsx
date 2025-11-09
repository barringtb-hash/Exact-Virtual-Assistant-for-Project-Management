import React, { useCallback } from "react";
import formatRelativeTime from "../utils/formatRelativeTime.js";
import { useDocTemplate } from "../state/docTemplateStore.js";
import { useDraft } from "../state/draftStore.ts";
import { FLAGS } from "../config/flags.ts";

const CUSTOM_EDITORS = {};

const FIELD_TEST_IDS = {
  project_name: "preview-field-title",
  scope_in: "preview-field-scope",
  sponsor: "preview-field-sponsor",
};

function includesSchemaType(schemaType, target) {
  if (!schemaType) return false;
  if (Array.isArray(schemaType)) {
    return schemaType.includes(target);
  }
  return schemaType === target;
}

function formatKeyLabel(key) {
  if (typeof key !== "string") {
    return "";
  }
  const withSpaces = key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!withSpaces) {
    return "";
  }
  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
}

function singularizeLabel(label) {
  if (typeof label !== "string" || label.length === 0) {
    return label;
  }
  if (label.endsWith("ies")) {
    return `${label.slice(0, -3)}y`;
  }
  if (label.endsWith("ses")) {
    return label.slice(0, -2);
  }
  if (label.endsWith("s")) {
    return label.slice(0, -1);
  }
  return label;
}

function buildArrayPlaceholder(label) {
  if (!label) return "Add item";
  const singular = singularizeLabel(label).toLowerCase();
  return `Add ${singular}`;
}

function buildTextPlaceholder(label) {
  if (!label) return "Enter value";
  return `Enter ${label.toLowerCase()}`;
}

function deriveSchemaFieldConfigs(schema) {
  const hasSchema = schema && typeof schema === "object" && !Array.isArray(schema);
  if (!hasSchema) {
    return null;
  }

  const properties =
    schema?.properties && typeof schema.properties === "object"
      ? schema.properties
      : {};
  const requiredKeys = Array.isArray(schema?.required) ? schema.required : [];
  const propertyOrder = [];
  const seenKeys = new Set();

  for (const key of requiredKeys) {
    if (properties[key] && !seenKeys.has(key)) {
      propertyOrder.push(key);
      seenKeys.add(key);
    }
  }

  for (const key of Object.keys(properties)) {
    if (!seenKeys.has(key)) {
      propertyOrder.push(key);
      seenKeys.add(key);
    }
  }

  const scalarFields = [];
  const stringArrayFields = [];
  const objectArrayFields = [];

  propertyOrder.forEach((key) => {
    const definition = properties[key];
    if (!definition || typeof definition !== "object") {
      return;
    }

    if (includesSchemaType(definition.type, "string")) {
      const label = definition.title || formatKeyLabel(key) || key;
      const placeholder = definition.placeholder || buildTextPlaceholder(label);
      const inputType = definition.format === "date" ? "date" : "text";
      const multiline =
        typeof definition.maxLength === "number" && definition.maxLength > 200;
      scalarFields.push({
        key,
        label,
        placeholder,
        type: inputType,
        multiline,
        description: definition.description,
      });
      return;
    }

    if (includesSchemaType(definition.type, "array")) {
      const items =
        definition.items && typeof definition.items === "object"
          ? definition.items
          : {};

      if (includesSchemaType(items.type, "string")) {
        const label = definition.title || formatKeyLabel(key) || key;
        stringArrayFields.push({
          key,
          label,
          addLabel: definition.addLabel || buildArrayPlaceholder(label),
          placeholder:
            items.placeholder || buildTextPlaceholder(singularizeLabel(label)),
          description: definition.description,
        });
        return;
      }

      if (includesSchemaType(items.type, "object")) {
        const itemProperties =
          items.properties && typeof items.properties === "object"
            ? items.properties
            : {};
        const itemRequired = Array.isArray(items.required)
          ? items.required
          : [];
        const entryOrder = [];
        const seenEntries = new Set();

        for (const entryKey of itemRequired) {
          if (itemProperties[entryKey] && !seenEntries.has(entryKey)) {
            entryOrder.push(entryKey);
            seenEntries.add(entryKey);
          }
        }

        for (const entryKey of Object.keys(itemProperties)) {
          if (!seenEntries.has(entryKey)) {
            entryOrder.push(entryKey);
            seenEntries.add(entryKey);
          }
        }

        const fields = entryOrder.map((entryKey) => {
          const entryDefinition = itemProperties[entryKey];
          const entryLabel =
            entryDefinition?.title || formatKeyLabel(entryKey) || entryKey;
          const placeholder =
            entryDefinition?.placeholder || buildTextPlaceholder(entryLabel);
          return {
            key: entryKey,
            label: entryLabel,
            placeholder,
          };
        });

        const label = definition.title || formatKeyLabel(key) || key;
        objectArrayFields.push({
          key,
          title: label,
          addLabel: definition.addLabel || buildArrayPlaceholder(label),
          fields,
          description: definition.description,
        });
      }
    }
  });

  const hasEditableFields =
    scalarFields.length > 0 ||
    stringArrayFields.length > 0 ||
    objectArrayFields.length > 0;

  if (!hasEditableFields) {
    return null;
  }

  return {
    scalarFields,
    stringArrayFields,
    objectArrayFields,
  };
}

function manifestItemRequiresSchema(item) {
  if (!item || typeof item !== "object") {
    return false;
  }

  if (item.component === "schema") {
    return true;
  }

  if (item.component === "row") {
    const columns = Array.isArray(item.columns) ? item.columns : [];
    return columns.some((column) => manifestItemRequiresSchema(column));
  }

  if (Array.isArray(item.items)) {
    return item.items.some((entry) => manifestItemRequiresSchema(entry));
  }

  return false;
}

const noop = () => {};

function FieldMetaTags({ source, updatedAt }) {
  // Hide timestamps if the readability flag is enabled
  const shouldShowTimestamp = !FLAGS.READABILITY_HIDE_FIELD_TIMESTAMPS;

  if (!source && (!shouldShowTimestamp || !updatedAt)) return null;

  const normalizedSource = (() => {
    if (typeof source !== "string") return "";
    const trimmed = source.trim();
    if (!trimmed) return "";
    if (trimmed.toLowerCase() === "ai" || trimmed.toLowerCase() === "auto") {
      return "Auto";
    }
    return trimmed;
  })();

  // Hide "Auto" chips in guided chat mode (when wizard is not visible)
  // In guided chat, we only show values after they're confirmed through conversation
  const shouldShowAutoChip =
    normalizedSource === "Auto" && (!FLAGS.CHARTER_GUIDED_CHAT_ENABLED || FLAGS.CHARTER_WIZARD_VISIBLE);
  const shouldShowSource = normalizedSource && (normalizedSource !== "Auto" || shouldShowAutoChip);

  const relative = typeof updatedAt === "number" ? formatRelativeTime(updatedAt) : "";

  const sourceToneClass =
    normalizedSource === "Auto"
      ? "bg-sky-100/80 text-sky-700 dark:bg-sky-900/60 dark:text-sky-200"
      : "bg-slate-200/70 text-slate-600 dark:bg-slate-700/60 dark:text-slate-200";

  return (
    <div className="mt-0.5 flex flex-wrap gap-1 text-[10px] text-slate-500 dark:text-slate-400">
      {shouldShowSource ? (
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${sourceToneClass}`}
        >
          {normalizedSource}
        </span>
      ) : null}
      {shouldShowTimestamp && relative ? (
        <span className="inline-flex items-center rounded-full bg-slate-200/40 px-2 py-0.5 font-medium text-slate-500 dark:bg-slate-700/40 dark:text-slate-300">
          {relative}
        </span>
      ) : null}
    </div>
  );
}

function LockBadge({ locked }) {
  if (!locked) return null;
  return (
    <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-900/60 dark:text-amber-200">
      Locked
    </span>
  );
}

function FieldHeader({ label, locked, description, meta, highlighted = false }) {
  const source = meta?.source;
  const updatedAt = meta?.updatedAt;

  const labelClass = FLAGS.READABILITY_V1
    ? "text-sm font-medium text-gray-700 dark:text-gray-200"
    : "font-medium text-slate-600 dark:text-slate-200";

  return (
    <div
      className={`mb-1 text-xs text-slate-500 transition-colors dark:text-slate-400 ${
        highlighted ? "rounded-lg bg-sky-50/80 px-2 py-1 dark:bg-sky-900/30" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <span className={labelClass}>{label}</span>
        <div className="flex items-center gap-2">
          {description ? <span className="text-[11px] text-slate-400 dark:text-slate-500">{description}</span> : null}
          <LockBadge locked={locked} />
        </div>
      </div>
      <FieldMetaTags source={source} updatedAt={updatedAt} />
    </div>
  );
}

function ScalarInput({
  label,
  path,
  value,
  placeholder,
  onChange,
  onLock,
  locked,
  type = "text",
  multiline = false,
  disabled = false,
  description,
  meta,
  highlighted = false,
  dataTestId,
}) {
  const baseClass = FLAGS.READABILITY_V1
    ? "w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-base text-gray-800 shadow-sm transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-70 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:focus:ring-indigo-500"
    : "w-full rounded-xl border border-white/70 bg-white/90 px-3 py-2 text-sm text-slate-700 shadow-sm transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-70 dark:border-slate-600/60 dark:bg-slate-800/70 dark:text-slate-100 dark:focus:ring-indigo-500";
  const highlightClasses = highlighted
    ? " border-sky-300 bg-sky-50/80 shadow-[0_0_0_1px_rgba(56,189,248,0.35)] focus:ring-sky-300 dark:border-sky-500/70 dark:bg-sky-900/40 dark:focus:ring-sky-400"
    : "";
  const baseProps = {
    value,
    onChange: (event) => {
      onChange(event.target.value);
      onLock(path);
    },
    placeholder,
    disabled,
    className: `${baseClass}${highlightClasses}`,
  };

  return (
    <label className="block" data-testid={dataTestId}>
      <FieldHeader
        label={label}
        locked={locked}
        description={description}
        meta={meta}
        highlighted={highlighted}
      />
      {multiline ? (
        <textarea rows={3} {...baseProps} />
      ) : (
        <input type={type} {...baseProps} />
      )}
    </label>
  );
}

function StringArrayEditor({
  label,
  path,
  items,
  addLabel,
  placeholder,
  onChange,
  onLock,
  isLocked,
  disabled,
  meta,
  itemMeta,
  description,
  isHighlighted = () => false,
  dataTestId,
}) {
  const safeItems = Array.isArray(items) ? items : [];
  const highlightPath = typeof isHighlighted === "function" ? isHighlighted(path) : false;
  const baseInputClass = FLAGS.READABILITY_V1
    ? "flex-1 rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-base text-gray-800 shadow-sm transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-70 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:focus:ring-indigo-500"
    : "flex-1 rounded-xl border border-white/70 bg-white/90 px-3 py-2 text-sm text-slate-700 shadow-sm transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-70 dark:border-slate-600/60 dark:bg-slate-800/70 dark:text-slate-100 dark:focus:ring-indigo-500";
  const highlightInputClasses = (highlighted) =>
    highlighted
      ? " border-sky-300 bg-sky-50/80 shadow-[0_0_0_1px_rgba(56,189,248,0.35)] focus:ring-sky-300 dark:border-sky-500/70 dark:bg-sky-900/40 dark:focus:ring-sky-400"
      : "";

  return (
    <div data-testid={dataTestId}>
      <FieldHeader
        label={label}
        locked={isLocked(path)}
        meta={meta}
        description={description}
        highlighted={highlightPath}
      />
      <div className="space-y-2">
        {safeItems.map((item, index) => {
          const itemPath = `${path}.${index}`;
          const currentMeta = itemMeta?.[itemPath];
          const itemHighlighted =
            typeof isHighlighted === "function" ? isHighlighted(itemPath) : false;
          return (
            <div key={itemPath} className="flex items-start gap-2">
              <textarea
                rows={2}
                value={typeof item === "string" ? item : ""}
                placeholder={placeholder}
                disabled={disabled}
                onChange={(event) => {
                  const nextItems = [...safeItems];
                  nextItems[index] = event.target.value;
                  onChange(path, nextItems);
                  onLock(itemPath);
                  onLock(path);
                }}
                className={`${baseInputClass}${highlightInputClasses(
                  itemHighlighted
                )}`}
              />
              <button
                type="button"
                onClick={() => {
                  const nextItems = safeItems.filter((_, idx) => idx !== index);
                  onChange(path, nextItems);
                  onLock(path);
                }}
                disabled={disabled}
                className="rounded-xl border border-white/60 px-2 py-1 text-xs text-slate-500 transition hover:bg-white/80 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600/60 dark:text-slate-300 dark:hover:bg-slate-800/70"
              >
                Remove
              </button>
              <div className="flex flex-col items-end gap-1">
                <LockBadge locked={isLocked(itemPath)} />
                <FieldMetaTags source={currentMeta?.source} updatedAt={currentMeta?.updatedAt} />
              </div>
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => {
            onChange(path, [...safeItems, ""]);
            onLock(path);
          }}
          disabled={disabled}
          className="rounded-xl border border-dashed border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-white/80 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600/60 dark:text-slate-300 dark:hover:bg-slate-800/60"
        >
          {addLabel}
        </button>
      </div>
    </div>
  );
}

function ObjectArrayEditor({
  path,
  items,
  title,
  fields,
  addLabel,
  onChange,
  onLock,
  isLocked,
  disabled,
  meta,
  fieldMeta,
  description,
  isHighlighted = () => false,
}) {
  const safeItems = Array.isArray(items) ? items : [];
  const baseInputClass = FLAGS.READABILITY_V1
    ? "w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-base text-gray-800 shadow-sm transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-70 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:focus:ring-indigo-500"
    : "w-full rounded-xl border border-white/70 bg-white/90 px-3 py-2 text-sm text-slate-700 shadow-sm transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-70 dark:border-slate-600/60 dark:bg-slate-800/70 dark:text-slate-100 dark:focus:ring-indigo-500";
  const highlightInputClasses = (highlighted) =>
    highlighted
      ? " border-sky-300 bg-sky-50/80 shadow-[0_0_0_1px_rgba(56,189,248,0.35)] focus:ring-sky-300 dark:border-sky-500/70 dark:bg-sky-900/40 dark:focus:ring-sky-400"
      : "";

  return (
    <div>
      <FieldHeader
        label={title}
        locked={isLocked(path)}
        meta={meta}
        description={description}
        highlighted={typeof isHighlighted === "function" ? isHighlighted(path) : false}
      />
      <div className="space-y-3">
        {safeItems.map((item, index) => {
          const basePath = `${path}.${index}`;
          const current = item && typeof item === "object" && !Array.isArray(item) ? item : {};
          const baseMeta = fieldMeta?.[basePath];
          const baseHighlighted =
            typeof isHighlighted === "function" ? isHighlighted(basePath) : false;
          return (
            <div
              key={basePath}
              className={`rounded-xl border p-3 transition-colors ${
                baseHighlighted
                  ? "border-sky-300 bg-sky-50/80 shadow-[0_0_0_1px_rgba(56,189,248,0.25)] dark:border-sky-500/70 dark:bg-sky-900/40"
                  : "border-white/70 bg-white/80 dark:border-slate-600/60 dark:bg-slate-800/50"
              }`}
            >
              <div className="space-y-2">
                {fields.map((field) => {
                  const fieldPath = `${basePath}.${field.key}`;
                  const currentMeta = fieldMeta?.[fieldPath];
                  const fieldHighlighted =
                    typeof isHighlighted === "function" ? isHighlighted(fieldPath) : false;
                  return (
                    <label key={field.key} className="block">
                      <FieldHeader
                        label={field.label}
                        locked={isLocked(fieldPath)}
                        meta={currentMeta}
                        highlighted={fieldHighlighted}
                      />
                      <input
                        type="text"
                        value={typeof current[field.key] === "string" ? current[field.key] : ""}
                        placeholder={field.placeholder}
                        disabled={disabled}
                        onChange={(event) => {
                          const nextItems = safeItems.map((entry, idx) => {
                            if (idx !== index) return entry;
                            const nextEntry = entry && typeof entry === "object" && !Array.isArray(entry) ? { ...entry } : {};
                            nextEntry[field.key] = event.target.value;
                            return nextEntry;
                          });
                          onChange(path, nextItems);
                          onLock(fieldPath);
                          onLock(basePath);
                        }}
                        className={`${baseInputClass}${highlightInputClasses(
                          fieldHighlighted
                        )}`}
                      />
                    </label>
                  );
                })}
              </div>
              <div className="mt-2 flex items-center justify-between">
                <div className="flex flex-col gap-1">
                  <LockBadge locked={isLocked(basePath)} />
                  {baseMeta ? (
                    <FieldMetaTags source={baseMeta.source} updatedAt={baseMeta.updatedAt} />
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const nextItems = safeItems.filter((_, idx) => idx !== index);
                    onChange(path, nextItems);
                    onLock(path);
                  }}
                  disabled={disabled}
                  className="rounded-xl border border-white/60 px-3 py-1 text-xs text-slate-500 transition hover:bg-white/80 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600/60 dark:text-slate-300 dark:hover:bg-slate-800/70"
                >
                  Remove
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => {
          const emptyEntry = fields.reduce((acc, field) => {
            acc[field.key] = "";
            return acc;
          }, {});
          onChange(path, [...safeItems, emptyEntry]);
          onLock(path);
        }}
        disabled={disabled}
        className="mt-2 rounded-xl border border-dashed border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-white/80 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600/60 dark:text-slate-300 dark:hover:bg-slate-800/60"
      >
        {addLabel}
      </button>
    </div>
  );
}

export default function PreviewEditable({
  draft,
  locks = {},
  fieldStates = {},
  highlightedPaths = new Set(),
  metadata = new Map(),
  onDraftChange = noop,
  onLockField = noop,
  isLoading = false,
  isPending = false,
  schema,
  manifest,
}) {
  const selectDocTemplate = useCallback(
    (snapshot) => ({
      docType: snapshot.docType,
      templateLabel: snapshot.templateLabel,
    }),
    []
  );
  const { docType: previewDocType, templateLabel } = useDocTemplate(selectDocTemplate);
  const storeDraft = useDraft();
  const providedDraft =
    draft && typeof draft === "object" && !Array.isArray(draft) ? draft : null;
  const providedFields =
    providedDraft && Object.prototype.hasOwnProperty.call(providedDraft, "fields")
      ? providedDraft.fields &&
        typeof providedDraft.fields === "object" &&
        !Array.isArray(providedDraft.fields)
        ? providedDraft.fields
        : {}
      : providedDraft;
  const baseDraft = providedFields ?? storeDraft ?? {};
  const safeDraft =
    baseDraft && typeof baseDraft === "object" && !Array.isArray(baseDraft) ? baseDraft : {};
  const highlightSet =
    highlightedPaths instanceof Set
      ? highlightedPaths
      : new Set(
          Array.isArray(highlightedPaths) ? highlightedPaths.filter(Boolean) : []
        );
  const metadataMap =
    metadata instanceof Map
      ? metadata
      : new Map(
          metadata && typeof metadata === "object"
            ? Object.entries(metadata)
            : []
        );
  const previewLocked = Boolean(isLoading || isPending);
  const showPendingOverlay = Boolean(isPending);
  const withOverlay = (node) => (
    <div className="relative">
      {showPendingOverlay ? (
        <div
          className="pointer-events-none absolute inset-0 rounded-2xl border border-sky-200/60 bg-white/60 backdrop-blur-sm animate-pulse dark:border-sky-400/30 dark:bg-slate-900/40"
          aria-hidden="true"
          data-testid="preview-pending-overlay"
        />
      ) : null}
      {node}
    </div>
  );
  const isLocked = (path) => Boolean(locks && locks[path]);
  const isHighlighted = (path) => (typeof path === "string" ? highlightSet.has(path) : false);
  const metaFor = (path) => {
    const fieldMeta = fieldStates?.[path];
    const draftMeta = metadataMap.get(path);
    if (!draftMeta) {
      return fieldMeta;
    }
    if (!fieldMeta) {
      return draftMeta;
    }
    return {
      ...fieldMeta,
      ...draftMeta,
    };
  };
  const metaCollectionForPrefix = (prefix) => {
    const entries = {};
    if (fieldStates && typeof fieldStates === "object") {
      for (const [key, value] of Object.entries(fieldStates)) {
        if (key === prefix || key.startsWith(`${prefix}.`)) {
          entries[key] = value;
        }
      }
    }
    if (metadataMap.size > 0) {
      metadataMap.forEach((value, key) => {
        if (key === prefix || key.startsWith(`${prefix}.`)) {
          const existing = entries[key] && typeof entries[key] === "object" ? entries[key] : {};
          entries[key] = {
            ...existing,
            ...(value && typeof value === "object" ? value : {}),
          };
        }
      });
    }
    return entries;
  };

  const normalizedDocType =
    typeof previewDocType === "string" && previewDocType.trim()
      ? previewDocType.trim()
      : null;

  const manifestConfig =
    manifest && typeof manifest === "object" && !Array.isArray(manifest)
      ? manifest
      : null;
  const previewManifest =
    manifestConfig && typeof manifestConfig.preview === "object"
      ? manifestConfig.preview
      : null;
  const manifestMode =
    previewManifest?.mode ||
    (Array.isArray(previewManifest?.sections) ? "sections" : null);
  const manifestSections = Array.isArray(previewManifest?.sections)
    ? previewManifest.sections
    : [];

  const schemaConfigs = deriveSchemaFieldConfigs(schema);
  const hasSchemaConfigs = Boolean(schemaConfigs);

  const displayDocLabel =
    previewManifest?.displayLabel ||
    manifestConfig?.label ||
    templateLabel ||
    normalizedDocType ||
    "Document";

  if (!normalizedDocType) {
    return withOverlay(
      <div className="space-y-3 rounded-2xl border border-dashed border-slate-300 bg-white/60 p-4 text-sm text-slate-600 dark:border-slate-600/60 dark:bg-slate-900/40 dark:text-slate-200">
        <p className="font-medium">No template selected.</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Pick a document type to start editing the preview.
        </p>
      </div>
    );
  }

  const manifestRequiresSchema =
    manifestMode === "sections" &&
    manifestSections.some(
      (section) =>
        Array.isArray(section?.items) &&
        section.items.some((item) => manifestItemRequiresSchema(item))
    );

  const renderScalarField = (field, keyPrefix, overrides = {}) => {
    const path =
      typeof field?.key === "string" && field.key.trim()
        ? field.key.trim()
        : null;
    if (!path) {
      return null;
    }
    const label =
      field?.label ||
      formatKeyLabel(path) ||
      path ||
      "";
    const placeholder =
      field?.placeholder || buildTextPlaceholder(label);
    const type =
      field?.type === "date" ? "date" : field?.type || "text";
    const multiline = Boolean(field?.multiline);
    const disabledFlag = Boolean(overrides.disabled ?? field?.disabled);
    const testId = FIELD_TEST_IDS[path];

    return (
      <ScalarInput
        key={keyPrefix || path}
        label={label}
        path={path}
        value={typeof safeDraft[path] === "string" ? safeDraft[path] : ""}
        placeholder={placeholder}
        onChange={(value) => onDraftChange(path, value)}
        onLock={onLockField}
        locked={isLocked(path)}
        disabled={previewLocked || disabledFlag}
        type={type}
        multiline={multiline}
        description={field?.description}
        meta={metaFor(path)}
        highlighted={isHighlighted(path)}
        dataTestId={testId}
      />
    );
  };

  const renderStringArrayField = (field, keyPrefix, overrides = {}) => {
    const path =
      typeof field?.key === "string" && field.key.trim()
        ? field.key.trim()
        : null;
    if (!path) {
      return null;
    }
    const label =
      field?.label ||
      formatKeyLabel(path) ||
      path ||
      "";
    const addLabel =
      field?.addLabel || buildArrayPlaceholder(label);
    const placeholder =
      field?.placeholder ||
      buildTextPlaceholder(singularizeLabel(label));
    const disabledFlag = Boolean(overrides.disabled ?? field?.disabled);
    const testId = FIELD_TEST_IDS[path];

    return (
      <StringArrayEditor
        key={keyPrefix || path}
        label={label}
        path={path}
        items={safeDraft[path]}
        addLabel={addLabel}
        placeholder={placeholder}
        onChange={onDraftChange}
        onLock={onLockField}
        isLocked={isLocked}
        disabled={previewLocked || disabledFlag}
        meta={metaFor(path)}
        itemMeta={metaCollectionForPrefix(path)}
        description={field?.description}
        isHighlighted={isHighlighted}
        dataTestId={testId}
      />
    );
  };

  const renderObjectArrayField = (field, keyPrefix, overrides = {}) => {
    const path =
      typeof field?.key === "string" && field.key.trim()
        ? field.key.trim()
        : null;
    if (!path) {
      return null;
    }
    const title =
      field?.title || formatKeyLabel(path) || path || "";
    const addLabel =
      field?.addLabel || buildArrayPlaceholder(title);
    const normalizedFields = Array.isArray(field?.fields)
      ? field.fields.map((entry) => {
          const entryKey =
            typeof entry?.key === "string" && entry.key.trim()
              ? entry.key.trim()
              : "";
          const entryLabel =
            entry?.label ||
            (entryKey ? formatKeyLabel(entryKey) : "") ||
            entryKey ||
            "";
          return {
            key: entryKey,
            label: entryLabel,
            placeholder:
              entry?.placeholder ||
              buildTextPlaceholder(entryLabel || entryKey || "Item"),
          };
        })
      : [];
    const disabledFlag = Boolean(overrides.disabled ?? field?.disabled);

    return (
      <ObjectArrayEditor
        key={keyPrefix || path}
        path={path}
        items={safeDraft[path]}
        title={title}
        fields={normalizedFields}
        addLabel={addLabel}
        onChange={onDraftChange}
        onLock={onLockField}
        isLocked={isLocked}
        disabled={previewLocked || disabledFlag}
        meta={metaFor(path)}
        fieldMeta={metaCollectionForPrefix(path)}
        description={field?.description}
        isHighlighted={isHighlighted}
      />
    );
  };

  const renderCustomEditor = (item, key) => {
    const name =
      typeof item?.name === "string" && item.name
        ? item.name
        : typeof item?.component === "string" && item.component !== "custom"
        ? item.component
        : null;
    const CustomComponent = name ? CUSTOM_EDITORS[name] : null;
    if (!CustomComponent) {
      return null;
    }
    return (
      <CustomComponent
        key={key}
        draft={safeDraft}
        locks={locks}
        fieldStates={fieldStates}
        onDraftChange={onDraftChange}
        onLockField={onLockField}
        isLocked={isLocked}
        isLoading={isLoading}
        manifestItem={item}
        manifest={manifestConfig}
        metaFor={metaFor}
        metaCollectionForPrefix={metaCollectionForPrefix}
        highlightedPaths={highlightSet}
        metadata={metadataMap}
      />
    );
  };

  const renderSchemaNodes = (includeList, keyPrefix) => {
    if (!schemaConfigs) {
      return [];
    }
    const normalizedInclude =
      Array.isArray(includeList) && includeList.length > 0
        ? includeList
        : ["scalar", "string-array", "object-array"];
    const includeSet = new Set(
      normalizedInclude.map((entry) => String(entry).toLowerCase())
    );
    const nodes = [];
    if (includeSet.has("scalar") || includeSet.has("scalars")) {
      nodes.push(
        ...schemaConfigs.scalarFields.map((field) =>
          renderScalarField(field, `${keyPrefix}-scalar-${field.key}`)
        )
      );
    }
    if (
      includeSet.has("string-array") ||
      includeSet.has("string_arrays") ||
      includeSet.has("stringarray")
    ) {
      nodes.push(
        ...schemaConfigs.stringArrayFields.map((field) =>
          renderStringArrayField(field, `${keyPrefix}-string-${field.key}`)
        )
      );
    }
    if (
      includeSet.has("object-array") ||
      includeSet.has("object_arrays") ||
      includeSet.has("objectarray")
    ) {
      nodes.push(
        ...schemaConfigs.objectArrayFields.map((field) =>
          renderObjectArrayField(field, `${keyPrefix}-object-${field.key}`)
        )
      );
    }
    return nodes;
  };

  const renderManifestItem = (item, keyPrefix) => {
    if (!item || typeof item !== "object") {
      return null;
    }
    switch (item.component) {
      case "scalar": {
        const path = item.path;
        const label =
          item.label ||
          (typeof path === "string" ? formatKeyLabel(path) : "") ||
          path;
        const placeholder =
          item.placeholder ||
          buildTextPlaceholder(label || path || "");
        const fieldConfig = {
          key: typeof path === "string" ? path : null,
          label,
          placeholder,
          type: item.type,
          multiline: item.multiline,
          description: item.description,
          disabled: item.disabled,
        };
        return renderScalarField(fieldConfig, keyPrefix || fieldConfig.key);
      }
      case "string-array": {
        const path = item.path;
        const label =
          item.label ||
          (typeof path === "string" ? formatKeyLabel(path) : "") ||
          path;
        const fieldConfig = {
          key: typeof path === "string" ? path : null,
          label,
          addLabel:
            item.addLabel ||
            buildArrayPlaceholder(label || path || ""),
          placeholder:
            item.placeholder ||
            buildTextPlaceholder(
              singularizeLabel(label || path || "")
            ),
          description: item.description,
          disabled: item.disabled,
        };
        return renderStringArrayField(fieldConfig, keyPrefix || fieldConfig.key);
      }
      case "object-array": {
        const path = item.path;
        const title =
          item.title ||
          (typeof path === "string" ? formatKeyLabel(path) : "") ||
          path;
        const fieldConfig = {
          key: typeof path === "string" ? path : null,
          title,
          addLabel:
            item.addLabel ||
            buildArrayPlaceholder(title || path || ""),
          fields: item.fields,
          description: item.description,
          disabled: item.disabled,
        };
        return renderObjectArrayField(fieldConfig, keyPrefix || fieldConfig.key);
      }
      case "row": {
        const columns = Array.isArray(item.columns) ? item.columns : [];
        if (columns.length === 0) {
          return null;
        }
        const columnElements = columns
          .map((column, columnIndex) =>
            renderManifestItem(
              column,
              `${keyPrefix || "row"}-col${columnIndex}`
            )
          )
          .flat()
          .filter(Boolean);
        if (columnElements.length === 0) {
          return null;
        }
        const columnCount = columns.length;
        const responsiveClass =
          columnCount >= 3
            ? "sm:grid-cols-3"
            : columnCount === 2
            ? "sm:grid-cols-2"
            : "sm:grid-cols-1";
        return (
          <div
            key={keyPrefix || `row-${columnCount}`}
            className={`grid grid-cols-1 gap-3 ${responsiveClass}`}
          >
            {columnElements}
          </div>
        );
      }
      case "schema": {
        return renderSchemaNodes(item.include, keyPrefix || "schema");
      }
      case "custom": {
        return renderCustomEditor(item, keyPrefix || item.name || "custom");
      }
      default: {
        if (
          typeof item.component === "string" &&
          CUSTOM_EDITORS[item.component]
        ) {
          return renderCustomEditor(
            { ...item, name: item.component, component: item.component },
            keyPrefix || item.component
          );
        }
        return null;
      }
    }
  };

  const renderManifestSections = () => {
    const sectionElements = manifestSections
      .map((section, sectionIndex) => {
        if (!section || typeof section !== "object") {
          return null;
        }
        const sectionItems = Array.isArray(section.items)
          ? section.items
          : [];
        const children = [];
        sectionItems.forEach((item, itemIndex) => {
          const result = renderManifestItem(
            item,
            `${section.id || sectionIndex}-${itemIndex}`
          );
          if (Array.isArray(result)) {
            result.forEach((node) => {
              if (node) {
                children.push(node);
              }
            });
          } else if (result) {
            children.push(result);
          }
        });
        if (children.length === 0) {
          return null;
        }
        const key = section.id || `${sectionIndex}`;
        const heading =
          section.title ??
          (sectionIndex === 0 ? displayDocLabel : null);

        const sectionContentClass = FLAGS.READABILITY_V1
          ? "space-y-4"
          : "space-y-3";
        const sectionWrapperClass = FLAGS.READABILITY_V1
          ? "rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900/40"
          : "";

        return (
          <section key={key} className={sectionWrapperClass}>
            <div className={sectionContentClass}>
              {heading ? (
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-100">
                  {heading}
                </h3>
              ) : null}
              {section.description ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {section.description}
                </p>
              ) : null}
              {children}
            </div>
          </section>
        );
      })
      .filter(Boolean);

    if (sectionElements.length === 0) {
      return null;
    }

    const containerGap = FLAGS.READABILITY_V1 ? "space-y-4" : "space-y-6";
    return <div className={containerGap}>{sectionElements}</div>;
  };

  const renderStructuredPreviewUnavailable = (headline) => (
    <div className="space-y-3 rounded-2xl border border-white/60 bg-white/70 p-4 text-sm text-slate-700 dark:border-slate-600/60 dark:bg-slate-900/40 dark:text-slate-200">
      <p className="font-medium">{headline}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        You can continue chatting with EVA to update the draft, or select a different template to enable inline editing.
      </p>
      <pre className="max-h-96 overflow-auto rounded-xl bg-slate-900/80 p-3 text-xs text-slate-100 dark:bg-slate-800/80">
        {JSON.stringify(safeDraft, null, 2)}
      </pre>
    </div>
  );

  if (
    manifestMode === "sections" &&
    manifestSections.length > 0 &&
    (!manifestRequiresSchema || hasSchemaConfigs)
  ) {
    const rendered = renderManifestSections();
    if (rendered) {
      return withOverlay(rendered);
    }
  }

  if ((manifestMode === "schema" || manifestRequiresSchema) && !hasSchemaConfigs) {
    return withOverlay(
      renderStructuredPreviewUnavailable(
        `Schema metadata not available for “${displayDocLabel}”.`
      )
    );
  }

  const shouldUseSchemaFallback =
    hasSchemaConfigs &&
    (manifestMode === "schema" ||
      (!manifestMode && normalizedDocType !== "charter"));

  if (shouldUseSchemaFallback) {
    return withOverlay(
      <div className="space-y-6">
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-100">
            {displayDocLabel}
          </h3>
          {schemaConfigs.scalarFields.map((field) =>
            renderScalarField(field, `schema-scalar-${field.key}`)
          )}
        </section>
        {schemaConfigs.stringArrayFields.map((field) =>
          renderStringArrayField(field, `schema-string-${field.key}`)
        )}
        {schemaConfigs.objectArrayFields.map((field) =>
          renderObjectArrayField(field, `schema-object-${field.key}`)
        )}
      </div>
    );
  }

  return withOverlay(
    renderStructuredPreviewUnavailable(
      `Structured preview not available for “${displayDocLabel}”.`
    )
  );
}
