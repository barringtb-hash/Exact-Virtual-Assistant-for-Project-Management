export type CharterFieldId =
  | "project_name"
  | "sponsor"
  | "project_lead"
  | "start_date"
  | "end_date"
  | "vision"
  | "problem"
  | "description"
  | "scope_in"
  | "scope_out"
  | "risks"
  | "assumptions"
  | "milestones"
  | "success_metrics"
  | "core_team";

type CharterFieldType =
  | "string"
  | "textarea"
  | "date"
  | "string_list"
  | "object_list";

export interface CharterFieldChild {
  id: string;
  label: string;
  type: "string" | "textarea" | "date";
  placeholder: string | null;
}

export interface CharterField {
  id: CharterFieldId;
  label: string;
  helpText: string;
  required: boolean;
  type: CharterFieldType;
  maxLength: number | null;
  placeholder: string | null;
  example: string | null;
  children?: CharterFieldChild[];
}

export const CHARTER_FIELDS: CharterField[] = [
  {
    id: "project_name",
    label: "Project Title",
    helpText:
      "Use the user-provided project title or the first heading from the uploaded scope document.",
    required: true,
    type: "string",
    maxLength: 160,
    placeholder: "Enter project title",
    example: "Phoenix CRM Migration",
  },
  {
    id: "sponsor",
    label: "Sponsor",
    helpText:
      "Identify the primary project sponsor responsible for funding or approvals.",
    required: true,
    type: "string",
    maxLength: 120,
    placeholder: "Primary sponsor",
    example: "Jordan Patel",
  },
  {
    id: "project_lead",
    label: "Project Lead",
    helpText: "Capture the name of the project lead (usually the logged-in PM).",
    required: true,
    type: "string",
    maxLength: 120,
    placeholder: "Project lead",
    example: "Alex Morgan",
  },
  {
    id: "start_date",
    label: "Start Date",
    helpText: "Parse the project start date in ISO format (YYYY-MM-DD).",
    required: true,
    type: "date",
    maxLength: null,
    placeholder: "YYYY-MM-DD",
    example: "2024-01-08",
  },
  {
    id: "end_date",
    label: "End Date",
    helpText: "Parse the project end date in ISO format (YYYY-MM-DD).",
    required: true,
    type: "date",
    maxLength: null,
    placeholder: "YYYY-MM-DD",
    example: "2024-07-31",
  },
  {
    id: "vision",
    label: "Vision",
    helpText: "Summarize the high-level vision or objectives of the project.",
    required: true,
    type: "textarea",
    maxLength: 2000,
    placeholder: "Describe the vision",
    example: "Deliver a unified CRM platform to improve sales visibility.",
  },
  {
    id: "problem",
    label: "Problem",
    helpText: "Describe the problem or opportunity addressed by the project.",
    required: true,
    type: "textarea",
    maxLength: 2000,
    placeholder: "Outline the problem",
    example: "Disconnected legacy systems limit customer insights.",
  },
  {
    id: "description",
    label: "Project Description",
    helpText:
      "Provide a brief narrative description of the project including context and goals.",
    required: true,
    type: "textarea",
    maxLength: 2500,
    placeholder: "Explain the project",
    example: "Implement Salesforce across regions with phased adoption.",
  },
  {
    id: "scope_in",
    label: "Scope In",
    helpText: "List the items explicitly included in scope.",
    required: false,
    type: "string_list",
    maxLength: null,
    placeholder: "Items that are included in scope",
    example: "Regional sales onboarding",
  },
  {
    id: "scope_out",
    label: "Scope Out",
    helpText: "List the items explicitly excluded from scope.",
    required: false,
    type: "string_list",
    maxLength: null,
    placeholder: "Items that are excluded from scope",
    example: "Post-launch support",
  },
  {
    id: "risks",
    label: "Risks",
    helpText: "Capture the known project risks.",
    required: false,
    type: "string_list",
    maxLength: null,
    placeholder: "Describe a risk",
    example: "Vendor availability",
  },
  {
    id: "assumptions",
    label: "Assumptions",
    helpText: "Capture any project assumptions.",
    required: false,
    type: "string_list",
    maxLength: null,
    placeholder: "Describe an assumption",
    example: "Funding approved in Q1",
  },
  {
    id: "milestones",
    label: "Milestones",
    helpText:
      "List project milestones with associated phases, deliverables, and target dates.",
    required: false,
    type: "object_list",
    maxLength: null,
    placeholder: "Add milestone",
    example: "Planning complete / Execution kickoff / 2024-03-15",
    children: [
      {
        id: "phase",
        label: "Phase",
        type: "string",
        placeholder: "Phase",
      },
      {
        id: "deliverable",
        label: "Deliverable",
        type: "string",
        placeholder: "Key deliverable",
      },
      {
        id: "date",
        label: "Target Date",
        type: "date",
        placeholder: "YYYY-MM-DD",
      },
    ],
  },
  {
    id: "success_metrics",
    label: "Success Metrics",
    helpText:
      "List success metrics with benefit, metric, and system of measurement.",
    required: false,
    type: "object_list",
    maxLength: null,
    placeholder: "Add success metric",
    example: "Reduce onboarding time / Cycle time / HRIS analytics",
    children: [
      {
        id: "benefit",
        label: "Benefit",
        type: "string",
        placeholder: "What improves?",
      },
      {
        id: "metric",
        label: "Metric",
        type: "string",
        placeholder: "Measurement",
      },
      {
        id: "system_of_measurement",
        label: "Measurement System",
        type: "string",
        placeholder: "How it's measured",
      },
    ],
  },
  {
    id: "core_team",
    label: "Core Team",
    helpText:
      "Create one entry per team member with name, role, and optional responsibilities.",
    required: false,
    type: "object_list",
    maxLength: null,
    placeholder: "Add team member",
    example: "Taylor Reed / Technical Lead / Owns integrations",
    children: [
      {
        id: "name",
        label: "Name",
        type: "string",
        placeholder: "Full name",
      },
      {
        id: "role",
        label: "Role",
        type: "string",
        placeholder: "Role or title",
      },
      {
        id: "responsibilities",
        label: "Responsibilities",
        type: "textarea",
        placeholder: "Responsibilities",
      },
    ],
  },
];
