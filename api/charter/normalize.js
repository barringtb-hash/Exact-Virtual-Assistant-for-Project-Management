const CORE_STRING_FIELDS = [
  "project_name",
  "sponsor",
  "project_lead",
  "start_date",
  "end_date",
  "vision",
  "problem",
  "description",
];

const STRING_LIST_FIELDS = ["scope_in", "scope_out", "risks", "assumptions"];

const toTrimmedString = (value) => {
  if (typeof value === "string") {
    return value.trim();
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }

  return "";
};

const normalizeStringList = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set();
  const items = [];

  for (const entry of value) {
    const text = toTrimmedString(entry);
    if (!text || seen.has(text)) {
      continue;
    }
    seen.add(text);
    items.push(text);
  }

  return items;
};

const normalizeObjectEntries = (value, fields, { extraStringFields = [] } = {}) => {
  if (!Array.isArray(value)) {
    return [];
  }

  const items = [];

  for (const entry of value) {
    if (entry == null) {
      continue;
    }

    if (typeof entry === "string") {
      const text = entry.trim();
      if (!text) {
        continue;
      }

      if (fields.includes("deliverable")) {
        items.push({ deliverable: text });
      } else if (fields.includes("metric")) {
        items.push({ metric: text });
      } else if (fields.includes("name")) {
        items.push({ name: text });
      }
      continue;
    }

    if (typeof entry !== "object") {
      continue;
    }

    const normalizedEntry = {};
    let hasContent = false;

    for (const field of fields) {
      const trimmed = toTrimmedString(entry[field]);
      if (trimmed) {
        normalizedEntry[field] = trimmed;
        hasContent = true;
      }
    }

    for (const field of extraStringFields) {
      const trimmed = toTrimmedString(entry[field]);
      if (trimmed) {
        normalizedEntry[field] = trimmed;
        hasContent = true;
      }
    }

    if (hasContent) {
      items.push(normalizedEntry);
    }
  }

  return items;
};

const cloneDefaultCharter = () => ({
  project_name: "",
  sponsor: "",
  project_lead: "",
  start_date: "",
  end_date: "",
  vision: "",
  problem: "",
  description: "",
  scope_in: [],
  scope_out: [],
  risks: [],
  assumptions: [],
  milestones: [],
  success_metrics: [],
  core_team: [],
});

export function normalizeCharterServer(input) {
  const source =
    input && typeof input === "object" && !Array.isArray(input) ? input : {};

  const normalized = { ...cloneDefaultCharter(), ...source };

  for (const field of CORE_STRING_FIELDS) {
    normalized[field] = toTrimmedString(source[field]);
  }

  for (const field of STRING_LIST_FIELDS) {
    normalized[field] = normalizeStringList(source[field]);
  }

  normalized.milestones = normalizeObjectEntries(source.milestones, [
    "phase",
    "deliverable",
    "date",
  ]);

  normalized.success_metrics = normalizeObjectEntries(source.success_metrics, [
    "benefit",
    "metric",
    "system_of_measurement",
  ]);

  normalized.core_team = normalizeObjectEntries(
    source.core_team,
    ["name", "role"],
    { extraStringFields: ["responsibilities"] }
  );

  return normalized;
}

export default normalizeCharterServer;
