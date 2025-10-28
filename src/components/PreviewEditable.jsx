import React from "react";

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

const noop = () => {};

function LockBadge({ locked }) {
  if (!locked) return null;
  return (
    <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-900/60 dark:text-amber-200">
      Locked
    </span>
  );
}

function FieldHeader({ label, locked, description }) {
  return (
    <div className="mb-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
      <span className="font-medium text-slate-600 dark:text-slate-200">{label}</span>
      <div className="flex items-center gap-2">
        {description ? <span className="text-[11px] text-slate-400 dark:text-slate-500">{description}</span> : null}
        <LockBadge locked={locked} />
      </div>
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
      <FieldHeader label={label} locked={locked} description={description} />
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
}) {
  const safeItems = Array.isArray(items) ? items : [];

  return (
    <div>
      <FieldHeader label={label} locked={isLocked(path)} />
      <div className="space-y-2">
        {safeItems.map((item, index) => {
          const itemPath = `${path}.${index}`;
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
              <LockBadge locked={isLocked(itemPath)} />
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
}) {
  const safeItems = Array.isArray(items) ? items : [];

  return (
    <div>
      <FieldHeader label={title} locked={isLocked(path)} />
      <div className="space-y-3">
        {safeItems.map((item, index) => {
          const basePath = `${path}.${index}`;
          const current = item && typeof item === "object" && !Array.isArray(item) ? item : {};
          return (
            <div key={basePath} className="rounded-xl border border-white/70 bg-white/80 p-3 dark:border-slate-600/60 dark:bg-slate-800/50">
              <div className="space-y-2">
                {fields.map((field) => {
                  const fieldPath = `${basePath}.${field.key}`;
                  return (
                    <label key={field.key} className="block">
                      <FieldHeader label={field.label} locked={isLocked(fieldPath)} />
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
                <LockBadge locked={isLocked(basePath)} />
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
  onDraftChange = noop,
  onLockField = noop,
  isLoading = false,
}) {
  const safeDraft = draft && typeof draft === "object" && !Array.isArray(draft) ? draft : {};
  const isLocked = (path) => Boolean(locks && locks[path]);

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-100">Project Charter</h3>
        <ScalarInput
          label="Project Title"
          path="project_name"
          value={typeof safeDraft.project_name === "string" ? safeDraft.project_name : ""}
          placeholder="Enter project title"
          onChange={(value) => onDraftChange("project_name", value)}
          onLock={onLockField}
          locked={isLocked("project_name")}
          disabled={isLoading}
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
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ScalarInput
            label="Start Date"
            path="start_date"
            type="date"
            value={typeof safeDraft.start_date === "string" ? safeDraft.start_date : ""}
            placeholder="Start date"
            onChange={(value) => onDraftChange("start_date", value)}
            onLock={onLockField}
            locked={isLocked("start_date")}
            disabled={isLoading}
          />
          <ScalarInput
            label="End Date"
            path="end_date"
            type="date"
            value={typeof safeDraft.end_date === "string" ? safeDraft.end_date : ""}
            placeholder="End date"
            onChange={(value) => onDraftChange("end_date", value)}
            onLock={onLockField}
            locked={isLocked("end_date")}
            disabled={isLoading}
          />
        </div>
        <ScalarInput
          label="Problem Statement"
          path="problem"
          value={typeof safeDraft.problem === "string" ? safeDraft.problem : ""}
          placeholder="What problem does this solve?"
          onChange={(value) => onDraftChange("problem", value)}
          onLock={onLockField}
          locked={isLocked("problem")}
          disabled={isLoading}
          multiline
        />
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-100">Design & Development Plan</h3>
        <ScalarInput
          label="Objectives"
          path="vision"
          value={typeof safeDraft.vision === "string" ? safeDraft.vision : ""}
          placeholder="What success looks like"
          onChange={(value) => onDraftChange("vision", value)}
          onLock={onLockField}
          locked={isLocked("vision")}
          disabled={isLoading}
          multiline
        />
        {STRING_ARRAY_FIELDS.slice(0, 2).map((config) => (
          <StringArrayEditor
            key={config.path}
            label={config.label}
            path={config.path}
            items={safeDraft[config.path]}
            addLabel={config.addLabel}
            placeholder={config.placeholder}
            onChange={onDraftChange}
            onLock={onLockField}
            isLocked={isLocked}
            disabled={isLoading}
          />
        ))}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-100">Milestones & Metrics</h3>
        {Object.entries(OBJECT_ARRAY_FIELDS)
          .filter(([key]) => key === "milestones" || key === "success_metrics")
          .map(([key, config]) => (
            <ObjectArrayEditor
              key={key}
              path={key}
              items={safeDraft[key]}
              title={config.title}
              fields={config.fields}
              addLabel={config.addLabel}
              onChange={onDraftChange}
              onLock={onLockField}
              isLocked={isLocked}
              disabled={isLoading}
            />
          ))}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-100">RAID Log Snapshot</h3>
        {STRING_ARRAY_FIELDS.slice(2).map((config) => (
          <StringArrayEditor
            key={config.path}
            label={config.label}
            path={config.path}
            items={safeDraft[config.path]}
            addLabel={config.addLabel}
            placeholder={config.placeholder}
            onChange={onDraftChange}
            onLock={onLockField}
            isLocked={isLocked}
            disabled={isLoading}
          />
        ))}
        <ObjectArrayEditor
          path="core_team"
          items={safeDraft.core_team}
          title={OBJECT_ARRAY_FIELDS.core_team.title}
          fields={OBJECT_ARRAY_FIELDS.core_team.fields}
          addLabel={OBJECT_ARRAY_FIELDS.core_team.addLabel}
          onChange={onDraftChange}
          onLock={onLockField}
          isLocked={isLocked}
          disabled={isLoading}
        />
        <ScalarInput
          label="Notes"
          path="description"
          value={typeof safeDraft.description === "string" ? safeDraft.description : ""}
          placeholder="Additional notes"
          onChange={(value) => onDraftChange("description", value)}
          onLock={onLockField}
          locked={isLocked("description")}
          disabled={isLoading}
          multiline
        />
      </section>
    </div>
  );
}
