#!/usr/bin/env node
/**
 * Creates a formatted Project Charter DOCX template with docxtemplater tokens.
 *
 * This generates a styled template with:
 * - Purple header rows for sections
 * - Proper table structure
 * - {{token}} placeholders for docxtemplater
 */

import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  AlignmentType,
  BorderStyle,
  ShadingType,
  HeadingLevel,
  Header,
  Footer,
  PageNumber,
  NumberFormat,
} from "docx";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Brand colors
const PURPLE = "7030A0";
const WHITE = "FFFFFF";
const LIGHT_GRAY = "F2F2F2";

// Helper to create a header cell (purple background, white text)
function headerCell(text, columnSpan = 1) {
  return new TableCell({
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text,
            bold: true,
            color: WHITE,
            size: 22,
          }),
        ],
      }),
    ],
    shading: { fill: PURPLE, type: ShadingType.CLEAR },
    columnSpan,
  });
}

// Helper to create a label cell (bold text)
function labelCell(text) {
  return new TableCell({
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text,
            bold: true,
            size: 20,
          }),
        ],
      }),
    ],
    shading: { fill: LIGHT_GRAY, type: ShadingType.CLEAR },
  });
}

// Helper to create a value cell with a token
function valueCell(token, description = "") {
  return new TableCell({
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text: `{{${token}}}`,
            size: 20,
          }),
        ],
      }),
    ],
  });
}

// Helper for multi-line description cells
function descriptionCell(text, italics = true) {
  return new TableCell({
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text,
            italics,
            size: 18,
            color: "666666",
          }),
        ],
      }),
    ],
    columnSpan: 2,
  });
}

// Helper for loop content (scope, risks, etc.)
function loopCell(loopName) {
  return new TableCell({
    children: [
      new Paragraph({
        children: [
          new TextRun({ text: `{{#${loopName}}}`, size: 20 }),
        ],
      }),
      new Paragraph({
        children: [
          new TextRun({ text: "• {{.}}", size: 20 }),
        ],
        bullet: { level: 0 },
      }),
      new Paragraph({
        children: [
          new TextRun({ text: `{{/${loopName}}}`, size: 20 }),
        ],
      }),
    ],
  });
}

async function createTemplate() {
  const doc = new Document({
    sections: [
      {
        properties: {},
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: "EXACT",
                    bold: true,
                    size: 28,
                  }),
                  new TextRun({
                    text: " SCIENCES",
                    size: 28,
                  }),
                  new TextRun({
                    text: "    Project Charter",
                    bold: true,
                    color: PURPLE,
                    size: 36,
                  }),
                ],
              }),
            ],
          }),
        },
        children: [
          // Title
          new Paragraph({
            text: "",
            spacing: { after: 200 },
          }),

          // General Project Information Section
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              // Header row
              new TableRow({
                children: [headerCell("General Project Information", 2)],
              }),
              // Project Name
              new TableRow({
                children: [
                  labelCell("Project Name:"),
                  valueCell("project_name"),
                ],
              }),
              // Sponsor
              new TableRow({
                children: [
                  labelCell("Sponsor:"),
                  valueCell("sponsor"),
                ],
              }),
              // Project Manager/Lead
              new TableRow({
                children: [
                  labelCell("Project Manager:"),
                  valueCell("project_lead"),
                ],
              }),
              // Start Date
              new TableRow({
                children: [
                  labelCell("Estimated Project Start Date:"),
                  valueCell("start_date"),
                ],
              }),
              // End Date
              new TableRow({
                children: [
                  labelCell("Estimated Project End Date:"),
                  valueCell("end_date"),
                ],
              }),
              // Vision
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({ text: "Project Vision: ", bold: true, size: 20 }),
                          new TextRun({ text: "What does the project aim to achieve?", italics: true, size: 18, color: "666666" }),
                        ],
                      }),
                    ],
                    columnSpan: 2,
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [new TextRun({ text: "{{vision}}", size: 20 })],
                      }),
                    ],
                    columnSpan: 2,
                  }),
                ],
              }),
              // Problem/Opportunity
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({ text: "Problem/Opportunity: ", bold: true, size: 20 }),
                          new TextRun({ text: "What is the problem you are trying to solve or the opportunity you wish to capitalize?", italics: true, size: 18, color: "666666" }),
                        ],
                      }),
                    ],
                    columnSpan: 2,
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [new TextRun({ text: "{{problem}}", size: 20 })],
                      }),
                    ],
                    columnSpan: 2,
                  }),
                ],
              }),
              // Description
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({ text: "Project Description: ", bold: true, size: 20 }),
                          new TextRun({ text: "What are the goals and objectives of the project?", italics: true, size: 18, color: "666666" }),
                        ],
                      }),
                    ],
                    columnSpan: 2,
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [new TextRun({ text: "{{description}}", size: 20 })],
                      }),
                    ],
                    columnSpan: 2,
                  }),
                ],
              }),
            ],
          }),

          new Paragraph({ text: "", spacing: { after: 200 } }),

          // Project Scope Section
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [headerCell("Project Scope", 2)],
              }),
              new TableRow({
                children: [
                  descriptionCell("Scope: Identify what the project will and will not address", true),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [new TextRun({ text: "In Scope:", bold: true, size: 20 })],
                      }),
                      new Paragraph({
                        children: [new TextRun({ text: "{{#scope_in}}", size: 20 })],
                      }),
                      new Paragraph({
                        children: [new TextRun({ text: "• {{.}}", size: 20 })],
                      }),
                      new Paragraph({
                        children: [new TextRun({ text: "{{/scope_in}}", size: 20 })],
                      }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [new TextRun({ text: "Out of Scope:", bold: true, size: 20 })],
                      }),
                      new Paragraph({
                        children: [new TextRun({ text: "{{#scope_out}}", size: 20 })],
                      }),
                      new Paragraph({
                        children: [new TextRun({ text: "• {{.}}", size: 20 })],
                      }),
                      new Paragraph({
                        children: [new TextRun({ text: "{{/scope_out}}", size: 20 })],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),

          new Paragraph({ text: "", spacing: { after: 200 } }),

          // Risks, Assumptions/Dependencies Section
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [headerCell("Project Risks, Assumptions/Dependencies", 2)],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({ text: "Project Risks/Constraints: ", bold: true, size: 20 }),
                          new TextRun({ text: "List any events or conditions which could limit the completion of the project.", italics: true, size: 18, color: "666666" }),
                        ],
                      }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({ text: "Assumptions/Dependencies: ", bold: true, size: 20 }),
                          new TextRun({ text: "Identify any event or situation expected to occur during the project.", italics: true, size: 18, color: "666666" }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [new TextRun({ text: "{{#risks}}", size: 20 })],
                      }),
                      new Paragraph({
                        children: [new TextRun({ text: "• {{.}}", size: 20 })],
                      }),
                      new Paragraph({
                        children: [new TextRun({ text: "{{/risks}}", size: 20 })],
                      }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [new TextRun({ text: "{{#assumptions}}", size: 20 })],
                      }),
                      new Paragraph({
                        children: [new TextRun({ text: "• {{.}}", size: 20 })],
                      }),
                      new Paragraph({
                        children: [new TextRun({ text: "{{/assumptions}}", size: 20 })],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),

          new Paragraph({ text: "", spacing: { after: 200 } }),

          // Milestones Section
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [headerCell("Milestones and Key Deliverables", 2)],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [new TextRun({ text: "Milestone / Key Deliverables", bold: true, size: 20 })],
                      }),
                    ],
                    shading: { fill: LIGHT_GRAY, type: ShadingType.CLEAR },
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [new TextRun({ text: "Anticipated Completion / Delivery Date", bold: true, size: 20 })],
                      }),
                    ],
                    shading: { fill: LIGHT_GRAY, type: ShadingType.CLEAR },
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [new TextRun({ text: "{{#milestones}}", size: 20 })],
                      }),
                      new Paragraph({
                        children: [new TextRun({ text: "{{phase}} – {{deliverable}}", size: 20 })],
                      }),
                      new Paragraph({
                        children: [new TextRun({ text: "{{/milestones}}", size: 20 })],
                      }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [new TextRun({ text: "{{#milestones}}", size: 20 })],
                      }),
                      new Paragraph({
                        children: [new TextRun({ text: "{{date}}", size: 20 })],
                      }),
                      new Paragraph({
                        children: [new TextRun({ text: "{{/milestones}}", size: 20 })],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),

          new Paragraph({ text: "", spacing: { after: 200 } }),

          // Success Metrics Section
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [headerCell("Success Metrics", 3)],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [new TextRun({ text: "Business Benefit", bold: true, size: 20 })],
                      }),
                    ],
                    shading: { fill: LIGHT_GRAY, type: ShadingType.CLEAR },
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [new TextRun({ text: "Metric", bold: true, size: 20 })],
                      }),
                    ],
                    shading: { fill: LIGHT_GRAY, type: ShadingType.CLEAR },
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [new TextRun({ text: "System of Measurement", bold: true, size: 20 })],
                      }),
                    ],
                    shading: { fill: LIGHT_GRAY, type: ShadingType.CLEAR },
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [new TextRun({ text: "{{#success_metrics}}{{benefit}}{{/success_metrics}}", size: 20 })],
                      }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [new TextRun({ text: "{{#success_metrics}}{{metric}}{{/success_metrics}}", size: 20 })],
                      }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [new TextRun({ text: "{{#success_metrics}}{{system_of_measurement}}{{/success_metrics}}", size: 20 })],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),

          new Paragraph({ text: "", spacing: { after: 200 } }),

          // Core Team Section
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [headerCell("Core Team", 3)],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [new TextRun({ text: "Name", bold: true, size: 20 })],
                      }),
                    ],
                    shading: { fill: LIGHT_GRAY, type: ShadingType.CLEAR },
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [new TextRun({ text: "Role", bold: true, size: 20 })],
                      }),
                    ],
                    shading: { fill: LIGHT_GRAY, type: ShadingType.CLEAR },
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [new TextRun({ text: "Project Responsibilities", bold: true, size: 20 })],
                      }),
                    ],
                    shading: { fill: LIGHT_GRAY, type: ShadingType.CLEAR },
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [new TextRun({ text: "{{#core_team}}{{name}}{{/core_team}}", size: 20 })],
                      }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [new TextRun({ text: "{{#core_team}}{{role}}{{/core_team}}", size: 20 })],
                      }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [new TextRun({ text: "{{#core_team}}{{#responsibilities}}• {{.}}{{/responsibilities}}{{/core_team}}", size: 20 })],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}

async function main() {
  console.log("Creating formatted Project Charter template...");

  const buffer = await createTemplate();

  const outputPath = path.resolve(__dirname, "..", "project_charter_tokens.docx");
  const b64OutputPath = path.resolve(__dirname, "..", "project_charter_tokens.docx.b64");

  // Write DOCX file
  await fs.writeFile(outputPath, buffer);
  console.log(`Written DOCX to ${outputPath}`);

  // Write Base64 encoded version
  const b64Content = buffer.toString("base64");
  await fs.writeFile(b64OutputPath, b64Content);
  console.log(`Written B64 to ${b64OutputPath}`);

  console.log("Done!");
}

main().catch((error) => {
  console.error("Failed to create template:", error);
  process.exitCode = 1;
});
