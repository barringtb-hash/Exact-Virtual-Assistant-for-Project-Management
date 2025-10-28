const ALIAS_TO_SCHEMA_FIELD = {
  projectTitle: "project_name",
  projectName: "project_name",
  project_title: "project_name",
  title: "project_name",
  projectManager: "project_lead",
  projectLead: "project_lead",
  project_manager: "project_lead",
  manager: "project_lead",
  sponsorName: "sponsor",
  sponsor_name: "sponsor",
  projectSponsor: "sponsor",
  project_sponsor: "sponsor",
  startDate: "start_date",
  endDate: "end_date",
  visionStatement: "vision",
  vision_statement: "vision",
  problemStatement: "problem",
  projectProblem: "problem",
  problem_statement: "problem",
  project_problem: "problem",
  projectDescription: "description",
  project_description: "description",
  scopeIn: "scope_in",
  scopeOut: "scope_out",
  riskList: "risks",
  risk_list: "risks",
  risksList: "risks",
  assumptionList: "assumptions",
  assumption_list: "assumptions",
  assumptionsList: "assumptions",
  milestonesList: "milestones",
  milestones_list: "milestones",
  successMetrics: "success_metrics",
  metrics: "success_metrics",
  coreTeam: "core_team",
  systemOfMeasurement: "system_of_measurement",
};

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

const OBJECT_ENTRY_FIELDS = {
  milestones: { fields: ["phase", "deliverable", "date"] },
  success_metrics: {
    fields: ["benefit", "metric", "system_of_measurement"],
  },
  core_team: {
    fields: ["name", "role"],
    extraStringFields: ["responsibilities"],
  },
};

const SINGLE_VALUE_FIELD_PRIORITY = ["deliverable", "metric", "name"];

export function coerceAliasesToSchemaKeys(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  const source = input;
  const clone = { ...source };

  for (const [alias, canonical] of Object.entries(ALIAS_TO_SCHEMA_FIELD)) {
    if (
      Object.prototype.hasOwnProperty.call(source, alias) &&
      !Object.prototype.hasOwnProperty.call(clone, canonical) &&
      source[alias] !== undefined
    ) {
      clone[canonical] = source[alias];
    }
  }

  return clone;
}

export function createBlankCharter() {
  return {
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
  };
}

export function toTrimmedString(value) {
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
}

function toArray(value, { splitStrings = false } = {}) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }

    if (!splitStrings) {
      return [trimmed];
    }

    return trimmed
      .split(/[\r\n]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (value == null) {
    return [];
  }

  return [value];
}

export function normalizeStringList(value) {
  const seen = new Set();
  const items = [];

  for (const entry of toArray(value, { splitStrings: true })) {
    const text = toTrimmedString(entry);
    if (!text || seen.has(text)) {
      continue;
    }
    seen.add(text);
    items.push(text);
  }

  return items;
}

function resolveSingleValueField(fields) {
  for (const candidate of SINGLE_VALUE_FIELD_PRIORITY) {
    if (fields.includes(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function normalizeObjectEntries(value, fields, { extraStringFields = [] } = {}) {
  const targetFields = Array.isArray(fields) ? fields : [];
  const fallbackField = resolveSingleValueField(targetFields);
  const items = [];

  for (const entry of toArray(value)) {
    if (entry == null) {
      continue;
    }

    if (typeof entry === "string") {
      const text = entry.trim();
      if (!text || !fallbackField) {
        continue;
      }
      items.push({ [fallbackField]: text });
      continue;
    }

    if (typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }

    const entrySource = coerceAliasesToSchemaKeys(entry);
    const normalizedEntry = {};
    let hasContent = false;

    for (const field of targetFields) {
      const trimmed = toTrimmedString(entrySource[field]);
      if (trimmed) {
        normalizedEntry[field] = trimmed;
        hasContent = true;
      }
    }

    for (const field of extraStringFields) {
      const trimmed = toTrimmedString(entrySource[field]);
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
}

export function normalizeCharterPayload(input) {
  const source = coerceAliasesToSchemaKeys(
    input && typeof input === "object" && !Array.isArray(input) ? input : {}
  );

  const normalized = { ...createBlankCharter(), ...source };

  for (const field of CORE_STRING_FIELDS) {
    normalized[field] = toTrimmedString(source[field]);
  }

  for (const field of STRING_LIST_FIELDS) {
    normalized[field] = normalizeStringList(source[field]);
  }

  for (const [key, config] of Object.entries(OBJECT_ENTRY_FIELDS)) {
    normalized[key] = normalizeObjectEntries(
      source[key],
      config.fields,
      config.extraStringFields ? { extraStringFields: config.extraStringFields } : undefined
    );
  }

  return normalized;
}

export default normalizeCharterPayload;
