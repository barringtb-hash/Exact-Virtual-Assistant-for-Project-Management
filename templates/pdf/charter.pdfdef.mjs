// Brand colors matching the DOCX template
const PURPLE = "#7030A0";
const WHITE = "#FFFFFF";
const LIGHT_GRAY = "#F2F2F2";
const DARK_TEXT = "#1a1a1a";
const GRAY_TEXT = "#666666";

// Table layout for sections with borders
const sectionTableLayout = {
  hLineWidth: () => 1,
  vLineWidth: () => 1,
  hLineColor: () => "#cccccc",
  vLineColor: () => "#cccccc",
  paddingLeft: () => 8,
  paddingRight: () => 8,
  paddingTop: () => 6,
  paddingBottom: () => 6,
};

// Layout for tables without visible borders (header area)
const noBorderLayout = {
  hLineWidth: () => 0,
  vLineWidth: () => 0,
  paddingLeft: () => 0,
  paddingRight: () => 0,
  paddingTop: () => 0,
  paddingBottom: () => 0,
};

export function buildPdfDefinition(charter) {
  const data = buildTemplateData(charter);

  const content = [
    // Header with branding
    {
      columns: [
        {
          text: [
            { text: "EXACT ", bold: true, fontSize: 14 },
            { text: "SCIENCES", fontSize: 14 },
          ],
          width: "auto",
        },
        {
          text: "Project Charter",
          style: "headerTitle",
          alignment: "right",
        },
      ],
      margin: [0, 0, 0, 20],
    },

    // General Project Information Section
    createSectionHeader("General Project Information"),
    createKeyValueTable([
      ["Project Name:", data.projectName],
      ["Sponsor:", data.sponsor],
      ["Project Manager:", data.projectLead],
      ["Estimated Project Start Date:", data.startDate],
      ["Estimated Project End Date:", data.endDate],
    ]),

    // Vision
    createLabelDescriptionRow("Project Vision:", "What does the project aim to achieve?"),
    createValueRow(data.vision),

    // Problem/Opportunity
    createLabelDescriptionRow("Problem/Opportunity:", "What is the problem you are trying to solve or the opportunity you wish to capitalize?"),
    createValueRow(data.problem),

    // Description
    createLabelDescriptionRow("Project Description:", "What are the goals and objectives of the project?"),
    createValueRow(data.description),

    { text: "", margin: [0, 10, 0, 0] },

    // Project Scope Section
    createSectionHeader("Project Scope"),
    createDescriptionRow("Scope: Identify what the project will and will not address"),
    createTwoColumnListTable("In Scope:", data.scopeIn, "Out of Scope:", data.scopeOut),

    { text: "", margin: [0, 10, 0, 0] },

    // Risks and Assumptions Section
    createSectionHeader("Project Risks, Assumptions/Dependencies"),
    createTwoColumnListTableWithDescriptions(
      "Project Risks/Constraints:",
      "List any events or conditions which could limit the completion of the project.",
      data.risks,
      "Assumptions/Dependencies:",
      "Identify any event or situation expected to occur during the project.",
      data.assumptions
    ),

    { text: "", margin: [0, 10, 0, 0] },

    // Milestones Section
    createSectionHeader("Milestones and Key Deliverables"),
    createMilestonesTable(data.milestones),

    { text: "", margin: [0, 10, 0, 0] },

    // Success Metrics Section
    createSectionHeader("Success Metrics"),
    createSuccessMetricsTable(data.successMetrics),

    { text: "", margin: [0, 10, 0, 0] },

    // Core Team Section
    createSectionHeader("Core Team"),
    createCoreTeamTable(data.coreTeam),
  ];

  return {
    pageSize: "A4",
    pageMargins: [40, 40, 40, 40],
    content,
    styles,
  };
}

function createSectionHeader(text) {
  return {
    table: {
      widths: ["*"],
      body: [
        [
          {
            text,
            bold: true,
            color: WHITE,
            fontSize: 11,
            fillColor: PURPLE,
          },
        ],
      ],
    },
    layout: sectionTableLayout,
    margin: [0, 0, 0, 0],
  };
}

function createKeyValueTable(rows) {
  const body = rows.map(([label, value]) => [
    {
      text: label,
      bold: true,
      fontSize: 10,
      fillColor: LIGHT_GRAY,
    },
    {
      text: value || "Not provided",
      fontSize: 10,
    },
  ]);

  return {
    table: {
      widths: [150, "*"],
      body,
    },
    layout: sectionTableLayout,
    margin: [0, 0, 0, 0],
  };
}

function createLabelDescriptionRow(label, description) {
  return {
    table: {
      widths: ["*"],
      body: [
        [
          {
            text: [
              { text: label, bold: true, fontSize: 10 },
              { text: " " + description, italics: true, fontSize: 9, color: GRAY_TEXT },
            ],
          },
        ],
      ],
    },
    layout: sectionTableLayout,
    margin: [0, 0, 0, 0],
  };
}

function createDescriptionRow(text) {
  return {
    table: {
      widths: ["*"],
      body: [
        [
          {
            text,
            italics: true,
            fontSize: 9,
            color: GRAY_TEXT,
          },
        ],
      ],
    },
    layout: sectionTableLayout,
    margin: [0, 0, 0, 0],
  };
}

function createValueRow(value) {
  return {
    table: {
      widths: ["*"],
      body: [
        [
          {
            text: value || "Not provided",
            fontSize: 10,
          },
        ],
      ],
    },
    layout: sectionTableLayout,
    margin: [0, 0, 0, 0],
  };
}

function createTwoColumnListTable(label1, items1, label2, items2) {
  const list1 = Array.isArray(items1) && items1.length > 0
    ? { ul: items1.map(item => ({ text: item, fontSize: 10 })), margin: [0, 4, 0, 0] }
    : { text: "Not provided", fontSize: 10, italics: true, color: GRAY_TEXT };

  const list2 = Array.isArray(items2) && items2.length > 0
    ? { ul: items2.map(item => ({ text: item, fontSize: 10 })), margin: [0, 4, 0, 0] }
    : { text: "Not provided", fontSize: 10, italics: true, color: GRAY_TEXT };

  return {
    table: {
      widths: ["50%", "50%"],
      body: [
        [
          {
            stack: [
              { text: label1, bold: true, fontSize: 10 },
              list1,
            ],
          },
          {
            stack: [
              { text: label2, bold: true, fontSize: 10 },
              list2,
            ],
          },
        ],
      ],
    },
    layout: sectionTableLayout,
    margin: [0, 0, 0, 0],
  };
}

function createTwoColumnListTableWithDescriptions(label1, desc1, items1, label2, desc2, items2) {
  const list1 = Array.isArray(items1) && items1.length > 0
    ? { ul: items1.map(item => ({ text: item, fontSize: 10 })), margin: [0, 4, 0, 0] }
    : { text: "Not provided", fontSize: 10, italics: true, color: GRAY_TEXT };

  const list2 = Array.isArray(items2) && items2.length > 0
    ? { ul: items2.map(item => ({ text: item, fontSize: 10 })), margin: [0, 4, 0, 0] }
    : { text: "Not provided", fontSize: 10, italics: true, color: GRAY_TEXT };

  return {
    table: {
      widths: ["50%", "50%"],
      body: [
        [
          {
            stack: [
              { text: label1, bold: true, fontSize: 10 },
              { text: desc1, italics: true, fontSize: 8, color: GRAY_TEXT, margin: [0, 2, 0, 4] },
            ],
          },
          {
            stack: [
              { text: label2, bold: true, fontSize: 10 },
              { text: desc2, italics: true, fontSize: 8, color: GRAY_TEXT, margin: [0, 2, 0, 4] },
            ],
          },
        ],
        [
          list1,
          list2,
        ],
      ],
    },
    layout: sectionTableLayout,
    margin: [0, 0, 0, 0],
  };
}

function createMilestonesTable(milestones) {
  const headerRow = [
    { text: "Milestone / Key Deliverables", bold: true, fontSize: 10, fillColor: LIGHT_GRAY },
    { text: "Anticipated Completion / Delivery Date", bold: true, fontSize: 10, fillColor: LIGHT_GRAY },
  ];

  const body = [headerRow];

  if (milestones.length === 0) {
    body.push([
      { text: "No milestones provided", colSpan: 2, italics: true, color: GRAY_TEXT, fontSize: 10 },
      {},
    ]);
  } else {
    milestones.forEach((milestone) => {
      body.push([
        { text: `${milestone.phase} – ${milestone.deliverable}`, fontSize: 10 },
        { text: milestone.dateDisplay, fontSize: 10 },
      ]);
    });
  }

  return {
    table: {
      widths: ["60%", "40%"],
      body,
    },
    layout: sectionTableLayout,
    margin: [0, 0, 0, 0],
  };
}

function createSuccessMetricsTable(metrics) {
  const headerRow = [
    { text: "Business Benefit", bold: true, fontSize: 10, fillColor: LIGHT_GRAY },
    { text: "Metric", bold: true, fontSize: 10, fillColor: LIGHT_GRAY },
    { text: "System of Measurement", bold: true, fontSize: 10, fillColor: LIGHT_GRAY },
  ];

  const body = [headerRow];

  if (metrics.length === 0) {
    body.push([
      { text: "No success metrics provided", colSpan: 3, italics: true, color: GRAY_TEXT, fontSize: 10 },
      {},
      {},
    ]);
  } else {
    metrics.forEach((metric) => {
      body.push([
        { text: metric.benefit || "Not provided", fontSize: 10 },
        { text: metric.metric || "Not provided", fontSize: 10 },
        { text: metric.system_of_measurement || "Not provided", fontSize: 10 },
      ]);
    });
  }

  return {
    table: {
      widths: ["33%", "34%", "33%"],
      body,
    },
    layout: sectionTableLayout,
    margin: [0, 0, 0, 0],
  };
}

function createCoreTeamTable(coreTeam) {
  const headerRow = [
    { text: "Name", bold: true, fontSize: 10, fillColor: LIGHT_GRAY },
    { text: "Role", bold: true, fontSize: 10, fillColor: LIGHT_GRAY },
    { text: "Project Responsibilities", bold: true, fontSize: 10, fillColor: LIGHT_GRAY },
  ];

  const body = [headerRow];

  if (coreTeam.length === 0) {
    body.push([
      { text: "No team members documented", colSpan: 3, italics: true, color: GRAY_TEXT, fontSize: 10 },
      {},
      {},
    ]);
  } else {
    coreTeam.forEach((member) => {
      const responsibilities = Array.isArray(member.responsibilities) && member.responsibilities.length > 0
        ? { ul: member.responsibilities.map(r => ({ text: r, fontSize: 10 })) }
        : { text: member.responsibilities || "Not provided", fontSize: 10 };

      body.push([
        { text: member.name || "Not provided", fontSize: 10 },
        { text: member.role || "Not provided", fontSize: 10 },
        responsibilities,
      ]);
    });
  }

  return {
    table: {
      widths: ["25%", "25%", "50%"],
      body,
    },
    layout: sectionTableLayout,
    margin: [0, 0, 0, 0],
  };
}

function buildTemplateData(charter) {
  const now = new Date();
  const generatedOn = formatDate(now);

  const scopeIn = normalizeStringList(charter.scope_in);
  const scopeOut = normalizeStringList(charter.scope_out);
  const risks = normalizeStringList(charter.risks);
  const assumptions = normalizeStringList(charter.assumptions);

  const milestones = Array.isArray(charter.milestones)
    ? charter.milestones
        .map((item) => {
          if (!item || typeof item !== "object") {
            return null;
          }

          const phase = toDisplayText(item.phase);
          const deliverable = toDisplayText(item.deliverable);
          const dateDisplay = formatDate(item.date) || "Not provided";

          return { phase, deliverable, dateDisplay };
        })
        .filter(Boolean)
    : [];

  const successMetrics = Array.isArray(charter.success_metrics)
    ? charter.success_metrics
        .map((item) => {
          if (!item || typeof item !== "object") {
            return null;
          }

          return {
            benefit: toDisplayText(item.benefit),
            metric: toDisplayText(item.metric),
            system_of_measurement: toDisplayText(item.system_of_measurement),
          };
        })
        .filter(Boolean)
    : [];

  const coreTeam = Array.isArray(charter.core_team)
    ? charter.core_team
        .map((member) => {
          if (!member || typeof member !== "object") {
            return null;
          }

          // Handle responsibilities as array (new format) or string (legacy)
          let responsibilities = member.responsibilities;
          if (Array.isArray(responsibilities)) {
            responsibilities = responsibilities.filter(r => typeof r === "string" && r.trim());
          } else if (typeof responsibilities === "string" && responsibilities.trim()) {
            responsibilities = [responsibilities.trim()];
          } else {
            responsibilities = null;
          }

          return {
            name: toDisplayText(member.name),
            role: toDisplayText(member.role),
            responsibilities,
          };
        })
        .filter(Boolean)
    : [];

  return {
    generatedOn,
    projectName: toDisplayText(charter.project_name),
    sponsor: toDisplayText(charter.sponsor),
    projectLead: toDisplayText(charter.project_lead),
    startDate: formatDate(charter.start_date) || "Not provided",
    endDate: formatDate(charter.end_date) || "Not provided",
    vision: toDisplayText(charter.vision),
    problem: toDisplayText(charter.problem),
    description: toDisplayText(charter.description),
    scopeIn,
    scopeOut,
    risks,
    assumptions,
    milestones,
    successMetrics,
    coreTeam,
  };
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const list = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    list.push(trimmed);
  }
  return list;
}

function toDisplayText(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return "Not provided";
}

function formatDate(value) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(value);
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.valueOf())) {
    return trimmed;
  }

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

const styles = {
  headerTitle: {
    fontSize: 18,
    bold: true,
    color: PURPLE,
  },
  title: {
    fontSize: 24,
    bold: true,
    color: DARK_TEXT,
    margin: [0, 0, 0, 6],
  },
  generated: {
    fontSize: 10,
    color: GRAY_TEXT,
  },
  sectionHeading: {
    fontSize: 12,
    bold: true,
    color: WHITE,
  },
  label: {
    fontSize: 10,
    bold: true,
    color: DARK_TEXT,
  },
  value: {
    fontSize: 10,
    color: DARK_TEXT,
    lineHeight: 1.35,
  },
  muted: {
    fontSize: 10,
    color: GRAY_TEXT,
    italics: true,
  },
};
