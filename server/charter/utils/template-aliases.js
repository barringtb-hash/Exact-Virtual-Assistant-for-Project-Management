export const TEMPLATE_ALIAS_TO_SNAKE_CASE = {
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

export function expandTemplateAliases(charter) {
  if (!charter || typeof charter !== "object" || Array.isArray(charter)) {
    return charter;
  }

  const expanded = { ...charter };

  for (const [legacyKey, canonicalKey] of Object.entries(TEMPLATE_ALIAS_TO_SNAKE_CASE)) {
    if (
      Object.prototype.hasOwnProperty.call(charter, legacyKey) &&
      !Object.prototype.hasOwnProperty.call(expanded, canonicalKey)
    ) {
      expanded[canonicalKey] = charter[legacyKey];
    }
  }

  return expanded;
}

