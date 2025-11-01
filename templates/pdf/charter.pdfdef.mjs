const cardTableLayout = {
  hLineWidth: () => 1,
  vLineWidth: () => 1,
  hLineColor: () => "#e2e8f0",
  vLineColor: () => "#e2e8f0",
  paddingLeft: () => 12,
  paddingRight: () => 12,
  paddingTop: () => 10,
  paddingBottom: () => 10,
};

export function buildPdfDefinition(charter) {
  const data = buildTemplateData(charter);
  const content = [
    {
      text: "Project Charter",
      style: "title",
    },
    {
      text: `Generated on ${data.generatedOn}`,
      style: "generated",
    },
  ];

  pushSection(content, "Overview", createCardRows([
    createLabeledCard("Project Name", data.projectName),
    createLabeledCard("Sponsor", data.sponsor),
    createLabeledCard("Project Lead", data.projectLead),
    createLabeledCard("Start Date", data.startDate),
    createLabeledCard("Target Completion", data.endDate),
  ]));

  pushSection(content, "Vision", [createParagraphCard(data.vision)]);
  pushSection(content, "Problem Statement", [createParagraphCard(data.problem)]);
  pushSection(content, "Description", [createParagraphCard(data.description)]);

  pushSection(content, "Scope", createCardRows([
    createCardFromSections([
      {
        label: "In Scope",
        value: {
          kind: "list",
          items: data.scopeIn,
          fallback: "Not provided",
        },
      },
    ]),
    createCardFromSections([
      {
        label: "Out of Scope",
        value: {
          kind: "list",
          items: data.scopeOut,
          fallback: "Not provided",
        },
      },
    ]),
  ]));

  pushSection(content, "Success Metrics", buildSuccessMetricSection(data.successMetrics));
  pushSection(content, "Milestones", buildMilestoneSection(data.milestones));
  pushSection(content, "Core Team", buildCoreTeamSection(data.coreTeam));

  pushSection(content, "Risks", [
    createCardFromSections([
      {
        value: {
          kind: "list",
          items: data.risks,
          fallback: "No risks identified.",
        },
      },
    ]),
  ]);

  pushSection(content, "Assumptions", [
    createCardFromSections([
      {
        value: {
          kind: "list",
          items: data.assumptions,
          fallback: "No assumptions listed.",
        },
      },
    ]),
  ]);

  return {
    pageSize: "A4",
    pageMargins: [40, 52, 40, 52],
    content,
    styles,
  };
}

function pushSection(content, title, nodes) {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return;
  }

  const margin = content.length > 2 ? [0, 28, 0, 12] : [0, 32, 0, 12];
  content.push({
    text: title,
    style: "sectionHeading",
    margin,
  });
  content.push(...nodes);
}

function createCardRows(cards, perRow = 2) {
  const filtered = cards.filter(Boolean);
  if (filtered.length === 0) {
    return [];
  }

  const rows = [];
  for (let i = 0; i < filtered.length; i += perRow) {
    const rowCards = filtered.slice(i, i + perRow);
    while (rowCards.length < perRow) {
      rowCards.push({ text: "" });
    }
    rows.push({
      columns: rowCards,
      columnGap: 16,
    });
  }
  return rows;
}

function createLabeledCard(label, value) {
  return createCardFromSections([
    {
      label,
      value,
    },
  ]);
}

function createParagraphCard(text) {
  return createTableCard([createValueNode(text, true)]);
}

function buildSuccessMetricSection(metrics) {
  if (!metrics.length) {
    return [createMutedParagraphCard("No success metrics provided.")];
  }

  const cards = metrics.map((metric) =>
    createCardFromSections([
      { label: "Benefit", value: metric.benefit },
      { label: "Metric", value: metric.metric },
      {
        label: "Measurement",
        value: metric.system_of_measurement,
      },
    ])
  );

  return createCardRows(cards);
}

function buildMilestoneSection(milestones) {
  if (!milestones.length) {
    return [createMutedParagraphCard("No milestones provided.")];
  }

  const cards = milestones.map((milestone) =>
    createCardFromSections([
      { label: "Phase", value: milestone.phase },
      { label: "Deliverable", value: milestone.deliverable },
      { label: "Target Date", value: milestone.dateDisplay },
    ])
  );

  return createCardRows(cards);
}

function buildCoreTeamSection(coreTeam) {
  if (!coreTeam.length) {
    return [createMutedParagraphCard("No team members documented.")];
  }

  const cards = coreTeam.map((member) =>
    createCardFromSections([
      { label: "Name", value: member.name },
      { label: "Role", value: member.role },
      {
        label: "Responsibilities",
        value:
          member.responsibilities ?? {
            kind: "muted",
            text: "No responsibilities documented.",
          },
      },
    ])
  );

  return createCardRows(cards);
}

function createMutedParagraphCard(text) {
  return createTableCard([createMutedValue(text, true)]);
}

function createCardFromSections(sections) {
  const stack = [];

  sections.forEach((section, index) => {
    const isLast = index === sections.length - 1;
    if (section.label) {
      stack.push({ text: section.label, style: "label" });
    }

    const nodes = createSectionValueNodes(section, isLast);
    stack.push(...nodes);
  });

  if (!stack.length) {
    stack.push(createMutedValue("Not provided", true));
  }

  return createTableCard(stack);
}

function createTableCard(stack) {
  return {
    table: {
      widths: ["*"],
      body: [
        [
          {
            stack,
            fillColor: "#f8fafc",
          },
        ],
      ],
    },
    layout: cardTableLayout,
    style: "card",
    width: "*",
  };
}

function createSectionValueNodes(section, isLast) {
  const value = section.value;

  if (value && typeof value === "object") {
    if (value.kind === "list") {
      return [createListValue(value.items, value.fallback, isLast)];
    }

    if (value.kind === "muted") {
      return [createMutedValue(value.text, isLast)];
    }

    if (value.kind === "nodes" && Array.isArray(value.nodes)) {
      return value.nodes.map((node, index) =>
        applyTrailingMargin(node, isLast && index === value.nodes.length - 1)
      );
    }
  }

  if (Array.isArray(value)) {
    return value.map((node, index) =>
      applyTrailingMargin(node, isLast && index === value.length - 1)
    );
  }

  if (typeof value === "string") {
    return [createValueNode(value, isLast)];
  }

  if (value == null && section.fallback) {
    return [createValueNode(section.fallback, isLast)];
  }

  if (value == null) {
    return [createMutedValue("Not provided", isLast)];
  }

  return [createValueNode(String(value), isLast)];
}

function applyTrailingMargin(node, isLast) {
  return {
    ...node,
    margin: [0, 0, 0, isLast ? 0 : 8],
  };
}

function createValueNode(text, isLast) {
  return {
    text,
    style: "value",
    margin: [0, 0, 0, isLast ? 0 : 8],
  };
}

function createMutedValue(text, isLast) {
  return {
    text,
    style: "muted",
    margin: [0, 0, 0, isLast ? 0 : 8],
  };
}

function createListValue(items, fallback, isLast) {
  if (Array.isArray(items) && items.length > 0) {
    return {
      ul: items,
      style: "value",
      margin: [0, 0, 0, isLast ? 0 : 8],
    };
  }

  return createMutedValue(fallback, isLast);
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

          return {
            name: toDisplayText(member.name),
            role: toDisplayText(member.role),
            responsibilities: toOptionalText(member.responsibilities),
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

function toOptionalText(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return null;
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
  title: {
    fontSize: 24,
    bold: true,
    color: "#0f172a",
    margin: [0, 0, 0, 6],
  },
  generated: {
    fontSize: 10,
    color: "#475569",
  },
  sectionHeading: {
    fontSize: 14,
    bold: true,
    color: "#0f172a",
    characterSpacing: 1.2,
  },
  card: {
    margin: [0, 0, 0, 16],
  },
  label: {
    fontSize: 9,
    bold: true,
    color: "#64748b",
    margin: [0, 0, 0, 4],
    characterSpacing: 1,
  },
  value: {
    fontSize: 11,
    color: "#0f172a",
    lineHeight: 1.35,
  },
  muted: {
    fontSize: 11,
    color: "#94a3b8",
    italics: true,
  },
};
