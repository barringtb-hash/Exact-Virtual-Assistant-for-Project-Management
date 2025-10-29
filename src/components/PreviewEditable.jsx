import React from "react";
import formatRelativeTime from "../utils/formatRelativeTime";
import { useDocTypeContext } from "../context/DocTypeContext.jsx";

const STRING_ARRAY_FIELDS = [
  {
    path: "scope_in",
    label: "Scope In",
    addLabel: "Add scope in item",
    placeholder: "Items that are included in scope",
  },
  {
    path: "scope_out",
    label: "Scope Out",
    addLabel: "Add scope out item",
    placeholder: "Items that are excluded from scope",
  },
  {
    path: "risks",
    label: "Risks",
    addLabel: "Add risk",
    placeholder: "Describe a risk",
  },
  {
    path: "assumptions",
    label: "Assumptions",
    addLabel: "Add assumption",
    placeholder: "Describe an assumption",
  },
];

const OBJECT_ARRAY_FIELDS = {
  milestones: {
    title: "Milestones",
    addLabel: "Add milestone",
    fields: [
      { key: "phase", label: "Phase", placeholder: "Phase" },
      { key: "deliverable", label: "Deliverable", placeholder: "Key deliverable" },
      { key: "date", label: "Target Date", placeholder: "YYYY-MM-DD" },
    ],
  },
  success_metrics: {
    title: "Success Metrics",
    addLabel: "Add success metric",
    fields: [
      { key: "benefit", label: "Benefit", placeholder: "What improves?" },
      { key: "metric", label: "Metric", placeholder: "Measurement" },
      { key: "system_of_measurement", label: "Measurement System", placeholder: "How it's measured" },
    ],
  },
  core_team: {
    title: "Core Team",
    addLabel: "Add team member",
    fields: [
      { key: "name", label: "Name", placeholder: "Full name" },
      { key: "role", label: "Role", placeholder: "Role or title" },
      { key: "responsibilities", label: "Responsibilities", placeholder: "Responsibilities" },
    ],
  },
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

const noop = () => {};

function FieldMetaTags({ source, updatedAt }) {
  if (!source && !updatedAt) return null;

  const relative = typeof updatedAt === "number" ? formatRelativeTime(updatedAt) : "";

  return (
    <div className="mt-0.5 flex flex-wrap gap-1 text-[10px] text-slate-500 dark:text-slate-400">
      {source ? (
        <span className="inline-flex items-center rounded-full bg-slate-200/70 px-2 py-0.5 font-medium text-slate-600 dark:bg-slate-700/60 dark:text-slate-200">
          {source}
        </span>
      ) : null}
      {relative ? (
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

function FieldHeader({ label, locked, description, meta }) {
  const source = meta?.source;
  const updatedAt = meta?.updatedAt;

  return (
    <div className="mb-1 text-xs text-slate-500 dark:text-slate-400">
      <div className="flex items-center justify-between">
        <span className="font-medium text-slate-600 dark:text-slate-200">{label}</span>
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
}) {
  const baseProps = {
    value,
    onChange: (event) => {
      onChange(event.target.value);
      onLock(path);
    },
    placeholder,
    disabled,
    className:
      "w-full rounded-xl border border-white/70 bg-white/90 px-3 py-2 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-70 dark:border-slate-600/60 dark:bg-slate-800/70 dark:text-slate-100 dark:focus:ring-indigo-500",
  };

  return (
    <label className="block">
      <FieldHeader label={label} locked={locked} description={description} meta={meta} />
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
}) {
  const safeItems = Array.isArray(items) ? items : [];

  return (
    <div>
      <FieldHeader label={label} locked={isLocked(path)} meta={meta} description={description} />
      <div className="space-y-2">
        {safeItems.map((item, index) => {
          const itemPath = `${path}.${index}`;
          const currentMeta = itemMeta?.[itemPath];
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
                className="flex-1 rounded-xl border border-white/70 bg-white/90 px-3 py-2 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-70 dark:border-slate-600/60 dark:bg-slate-800/70 dark:text-slate-100 dark:focus:ring-indigo-500"
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
}) {
  const safeItems = Array.isArray(items) ? items : [];

  return (
    <div>
      <FieldHeader label={title} locked={isLocked(path)} meta={meta} description={description} />
      <div className="space-y-3">
        {safeItems.map((item, index) => {
          const basePath = `${path}.${index}`;
          const current = item && typeof item === "object" && !Array.isArray(item) ? item : {};
          const baseMeta = fieldMeta?.[basePath];
          return (
            <div key={basePath} className="rounded-xl border border-white/70 bg-white/80 p-3 dark:border-slate-600/60 dark:bg-slate-800/50">
              <div className="space-y-2">
                {fields.map((field) => {
                  const fieldPath = `${basePath}.${field.key}`;
                  const currentMeta = fieldMeta?.[fieldPath];
                  return (
                    <label key={field.key} className="block">
                      <FieldHeader label={field.label} locked={isLocked(fieldPath)} meta={currentMeta} />
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
                        className="w-full rounded-xl border border-white/70 bg-white/90 px-3 py-2 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-70 dark:border-slate-600/60 dark:bg-slate-800/70 dark:text-slate-100 dark:focus:ring-indigo-500"
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
  onDraftChange = noop,
  onLockField = noop,
  isLoading = false,
  schema,
}) {
  const { previewDocType, previewDocTypeLabel } = useDocTypeContext();
  const safeDraft = draft && typeof draft === "object" && !Array.isArray(draft) ? draft : {};
  const isLocked = (path) => Boolean(locks && locks[path]);
  const metaFor = (path) => fieldStates?.[path];
  const metaCollectionForPrefix = (prefix) => {
    const entries = {};
    if (!fieldStates) return entries;
    for (const [key, value] of Object.entries(fieldStates)) {
      if (key === prefix || key.startsWith(`${prefix}.`)) {
        entries[key] = value;
      }
    }
    return entries;
  };

  const normalizedDocType =
    typeof previewDocType === "string" && previewDocType.trim()
      ? previewDocType.trim()
      : null;
  const displayDocLabel = previewDocTypeLabel || normalizedDocType || "Document";

  if (!normalizedDocType) {
    return (
      <div className="space-y-3 rounded-2xl border border-dashed border-slate-300 bg-white/60 p-4 text-sm text-slate-600 dark:border-slate-600/60 dark:bg-slate-900/40 dark:text-slate-200">
        <p className="font-medium">No template selected.</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Pick a document type to start editing the preview.
        </p>
      </div>
    );
  }

  if (normalizedDocType !== "charter") {
    const hasSchema = schema && typeof schema === "object" && !Array.isArray(schema);

    if (!hasSchema) {
      return (
        <div className="space-y-3 rounded-2xl border border-white/60 bg-white/70 p-4 text-sm text-slate-700 dark:border-slate-600/60 dark:bg-slate-900/40 dark:text-slate-200">
          <p className="font-medium">Schema metadata not available for “{displayDocLabel}”.</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            You can continue chatting with EVA to update the draft, or select a different template to enable inline editing.
          </p>
          <pre className="max-h-96 overflow-auto rounded-xl bg-slate-900/80 p-3 text-xs text-slate-100 dark:bg-slate-800/80">
            {JSON.stringify(safeDraft, null, 2)}
          </pre>
        </div>
      );
    }

    const properties = schema?.properties && typeof schema.properties === "object" ? schema.properties : {};
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
        const multiline = typeof definition.maxLength === "number" && definition.maxLength > 200;
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
        const items = definition.items && typeof definition.items === "object" ? definition.items : {};
        if (includesSchemaType(items.type, "string")) {
          const label = definition.title || formatKeyLabel(key) || key;
          stringArrayFields.push({
            key,
            label,
            addLabel: buildArrayPlaceholder(label),
            placeholder: definition.items?.placeholder || buildTextPlaceholder(singularizeLabel(label)),
            description: definition.description,
          });
          return;
        }

        if (includesSchemaType(items.type, "object")) {
          const itemProperties = items.properties && typeof items.properties === "object" ? items.properties : {};
          const itemRequired = Array.isArray(items.required) ? items.required : [];
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
            const entryLabel = entryDefinition?.title || formatKeyLabel(entryKey) || entryKey;
            const placeholder = entryDefinition?.placeholder || buildTextPlaceholder(entryLabel);
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
            addLabel: buildArrayPlaceholder(label),
            fields,
            description: definition.description,
          });
        }
      }
    });

    const hasEditableFields =
      scalarFields.length > 0 || stringArrayFields.length > 0 || objectArrayFields.length > 0;

    if (!hasEditableFields) {
      return (
        <div className="space-y-3 rounded-2xl border border-white/60 bg-white/70 p-4 text-sm text-slate-700 dark:border-slate-600/60 dark:bg-slate-900/40 dark:text-slate-200">
          <p className="font-medium">No editable fields detected for “{displayDocLabel}”.</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Try updating the document through chat or switch to another template with inline editing support.
          </p>
          <pre className="max-h-96 overflow-auto rounded-xl bg-slate-900/80 p-3 text-xs text-slate-100 dark:bg-slate-800/80">
            {JSON.stringify(safeDraft, null, 2)}
          </pre>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-100">{displayDocLabel}</h3>
          {scalarFields.map((field) => (
            <ScalarInput
              key={field.key}
              label={field.label}
              path={field.key}
              value={typeof safeDraft[field.key] === "string" ? safeDraft[field.key] : ""}
              placeholder={field.placeholder}
              onChange={(value) => onDraftChange(field.key, value)}
              onLock={onLockField}
              locked={isLocked(field.key)}
              disabled={isLoading}
              type={field.type}
              multiline={field.multiline}
              description={field.description}
              meta={metaFor(field.key)}
            />
          ))}
        </section>
        {stringArrayFields.map((field) => (
          <StringArrayEditor
            key={field.key}
            label={field.label}
            path={field.key}
            items={safeDraft[field.key]}
            addLabel={field.addLabel}
            placeholder={field.placeholder}
            onChange={onDraftChange}
            onLock={onLockField}
            isLocked={isLocked}
            disabled={isLoading}
            meta={metaFor(field.key)}
            itemMeta={metaCollectionForPrefix(field.key)}
            description={field.description}
          />
        ))}
        {objectArrayFields.map((field) => (
          <ObjectArrayEditor
            key={field.key}
            path={field.key}
            items={safeDraft[field.key]}
            title={field.title}
            fields={field.fields}
            addLabel={field.addLabel}
            onChange={onDraftChange}
            onLock={onLockField}
            isLocked={isLocked}
            disabled={isLoading}
            meta={metaFor(field.key)}
            fieldMeta={metaCollectionForPrefix(field.key)}
            description={field.description}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-100">{displayDocLabel}</h3>
        <ScalarInput
          label="Project Title"
          path="project_name"
          value={typeof safeDraft.project_name === "string" ? safeDraft.project_name : ""}
          placeholder="Enter project title"
          onChange={(value) => onDraftChange("project_name", value)}
          onLock={onLockField}
          locked={isLocked("project_name")}
          disabled={isLoading}
          meta={metaFor("project_name")}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ScalarInput
            label="Sponsor"
            path="sponsor"
            value={typeof safeDraft.sponsor === "string" ? safeDraft.sponsor : ""}
            placeholder="Primary sponsor"
            onChange={(value) => onDraftChange("sponsor", value)}
            onLock={onLockField}
            locked={isLocked("sponsor")}
            disabled={isLoading}
            meta={metaFor("sponsor")}
          />
          <ScalarInput
            label="Project Lead"
            path="project_lead"
            value={typeof safeDraft.project_lead === "string" ? safeDraft.project_lead : ""}
            placeholder="Project lead"
            onChange={(value) => onDraftChange("project_lead", value)}
            onLock={onLockField}
            locked={isLocked("project_lead")}
            disabled={isLoading}
            meta={metaFor("project_lead")}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ScalarInput
            label="Start Date"
            path="start_date"
            value={typeof safeDraft.start_date === "string" ? safeDraft.start_date : ""}
            placeholder="YYYY-MM-DD"
            onChange={(value) => onDraftChange("start_date", value)}
            onLock={onLockField}
            locked={isLocked("start_date")}
            disabled={isLoading}
            type="date"
            meta={metaFor("start_date")}
          />
          <ScalarInput
            label="End Date"
            path="end_date"
            value={typeof safeDraft.end_date === "string" ? safeDraft.end_date : ""}
            placeholder="YYYY-MM-DD"
            onChange={(value) => onDraftChange("end_date", value)}
            onLock={onLockField}
            locked={isLocked("end_date")}
            disabled={isLoading}
            type="date"
            meta={metaFor("end_date")}
          />
        </div>
        <ScalarInput
          label="Vision"
          path="vision"
          value={typeof safeDraft.vision === "string" ? safeDraft.vision : ""}
          placeholder="Describe the vision"
          onChange={(value) => onDraftChange("vision", value)}
          onLock={onLockField}
          locked={isLocked("vision")}
          disabled={isLoading}
          multiline
          meta={metaFor("vision")}
        />
        <ScalarInput
          label="Problem"
          path="problem"
          value={typeof safeDraft.problem === "string" ? safeDraft.problem : ""}
          placeholder="Outline the problem"
          onChange={(value) => onDraftChange("problem", value)}
          onLock={onLockField}
          locked={isLocked("problem")}
          disabled={isLoading}
          multiline
          meta={metaFor("problem")}
        />
        <ScalarInput
          label="Project Description"
          path="description"
          value={typeof safeDraft.description === "string" ? safeDraft.description : ""}
          placeholder="Explain the project"
          onChange={(value) => onDraftChange("description", value)}
          onLock={onLockField}
          locked={isLocked("description")}
          disabled={isLoading}
          multiline
          meta={metaFor("description")}
        />
      </section>
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-100">Scope & Risks</h3>
        {STRING_ARRAY_FIELDS.map((field) => (
          <StringArrayEditor
            key={field.path}
            label={field.label}
            path={field.path}
            items={safeDraft[field.path]}
            addLabel={field.addLabel}
            placeholder={field.placeholder}
            onChange={onDraftChange}
            onLock={onLockField}
            isLocked={isLocked}
            disabled={isLoading}
            meta={metaFor(field.path)}
            itemMeta={metaCollectionForPrefix(field.path)}
          />
        ))}
      </section>
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-100">Milestones & Metrics</h3>
        {Object.entries(OBJECT_ARRAY_FIELDS).map(([path, config]) => (
          <ObjectArrayEditor
            key={path}
            path={path}
            items={safeDraft[path]}
            title={config.title}
            fields={config.fields}
            addLabel={config.addLabel}
            onChange={onDraftChange}
            onLock={onLockField}
            isLocked={isLocked}
            disabled={isLoading}
            meta={metaFor(path)}
            fieldMeta={metaCollectionForPrefix(path)}
          />
        ))}
      </section>
    </div>
  );
}
