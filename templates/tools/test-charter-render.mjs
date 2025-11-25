#!/usr/bin/env node
/**
 * Test Charter Template Rendering
 *
 * This script tests the charter template rendering with sample data
 * to verify that array fields render correctly (multiple rows, not single row).
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.resolve(__dirname, '..');

const TEST_DATA = {
  project_name: 'Test Project Alpha',
  sponsor: 'Jane Executive',
  project_lead: 'John Manager',
  start_date: '2025-01-15',
  end_date: '2025-06-30',
  vision: 'Deliver a world-class solution that transforms how teams collaborate.',
  problem: 'Current systems are fragmented and cause delays in communication.',
  description: 'This project will implement a unified platform for team collaboration.',
  scope_in: [
    'User authentication and authorization',
    'Real-time messaging',
    'File sharing capabilities',
    'Mobile app development',
  ],
  scope_out: [
    'Video conferencing (Phase 2)',
    'Third-party integrations',
    'Legacy system migration',
  ],
  risks: [
    'Resource availability during holiday season',
    'Third-party API reliability',
    'Scope creep from stakeholder requests',
  ],
  assumptions: [
    'Budget approved for full project duration',
    'Core team members available 80% capacity',
    'Infrastructure provisioned by IT team',
  ],
  milestones: [
    { phase: 'Planning', deliverable: 'Requirements document', date: '2025-02-01' },
    { phase: 'Design', deliverable: 'Technical architecture', date: '2025-02-28' },
    { phase: 'Development', deliverable: 'MVP release', date: '2025-04-30' },
    { phase: 'Testing', deliverable: 'QA sign-off', date: '2025-05-31' },
    { phase: 'Launch', deliverable: 'Production deployment', date: '2025-06-15' },
  ],
  success_metrics: [
    { benefit: 'Improved collaboration', metric: 'Team response time', system_of_measurement: 'Hours to respond' },
    { benefit: 'Increased productivity', metric: 'Tasks completed per sprint', system_of_measurement: 'Task count' },
    { benefit: 'User satisfaction', metric: 'NPS score', system_of_measurement: 'Score 0-100' },
  ],
  core_team: [
    { name: 'John Manager', role: 'Project Lead', responsibilities: 'Overall project delivery and stakeholder management' },
    { name: 'Sarah Developer', role: 'Tech Lead', responsibilities: 'Architecture decisions and code reviews' },
    { name: 'Mike Designer', role: 'UX Lead', responsibilities: 'User experience and interface design' },
    { name: 'Lisa QA', role: 'QA Lead', responsibilities: 'Test strategy and quality assurance' },
  ],
};

async function loadTemplate(templatePath) {
  const b64Content = await fs.readFile(templatePath, 'utf8');
  return Buffer.from(b64Content.trim(), 'base64');
}

async function renderTemplate(templateBuffer, data) {
  const zip = new PizZip(templateBuffer);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    syntax: {
      allowUnclosedTag: true,
      allowUnopenedTag: true,
    },
  });

  doc.setData(data);
  doc.render();

  return doc.getZip().generate({ type: 'nodebuffer' });
}

function extractDocumentXml(docxBuffer) {
  const zip = new PizZip(docxBuffer);
  const documentFile = zip.file('word/document.xml');
  return documentFile ? documentFile.asText() : null;
}

function countTableRows(xml, afterText) {
  // Find the section after a specific text and count <w:tr> elements
  const idx = xml.indexOf(afterText);
  if (idx === -1) return { found: false, rows: 0 };

  // Find the next table after this text
  const tableStart = xml.indexOf('<w:tbl>', idx);
  if (tableStart === -1) return { found: true, rows: 0, noTable: true };

  const tableEnd = xml.indexOf('</w:tbl>', tableStart);
  if (tableEnd === -1) return { found: true, rows: 0, malformed: true };

  const tableXml = xml.substring(tableStart, tableEnd);
  const rows = (tableXml.match(/<w:tr>/g) || []).length;

  return { found: true, rows };
}

function countParagraphsWithBullet(xml, sectionTitle) {
  // Find paragraphs after a section title
  const idx = xml.indexOf(sectionTitle);
  if (idx === -1) return { found: false, count: 0 };

  // Look for bullet list paragraphs (simplified check)
  const nextSectionIdx = xml.indexOf('</w:p><w:p>', idx + 200);
  const sectionXml = xml.substring(idx, nextSectionIdx > idx ? nextSectionIdx + 500 : idx + 2000);

  // Count list items (look for paragraphs with content after the title)
  const items = (sectionXml.match(/<w:p>.*?<\/w:p>/g) || []).length;

  return { found: true, count: items };
}

async function main() {
  const [, , templateArg] = process.argv;

  const templateFiles = templateArg
    ? [templateArg]
    : [
        path.join(TEMPLATES_DIR, 'project_charter_tokens.docx.b64'),
        path.join(TEMPLATES_DIR, 'project_charter_tokens_fixed.docx.b64'),
      ];

  for (const templatePath of templateFiles) {
    try {
      await fs.access(templatePath);
    } catch {
      console.log(`\nSkipping ${path.basename(templatePath)} (file not found)`);
      continue;
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing: ${path.basename(templatePath)}`);
    console.log('='.repeat(60));

    const templateBuffer = await loadTemplate(templatePath);
    const renderedBuffer = await renderTemplate(templateBuffer, TEST_DATA);

    // Save the rendered output for manual inspection
    const outputName = path.basename(templatePath).replace('.b64', '.rendered.docx');
    const outputPath = path.join(TEMPLATES_DIR, 'test-output', outputName);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, renderedBuffer);
    console.log(`Rendered output saved to: ${outputPath}`);

    // Extract and analyze the document XML
    const xml = extractDocumentXml(renderedBuffer);

    console.log('\nArray Field Rendering Analysis:');
    console.log('-'.repeat(40));

    // Check milestones (should have 5 data rows + 1 header = 6 total, or 5 if header separate)
    const milestones = countTableRows(xml, 'Milestones');
    console.log(`Milestones table rows: ${milestones.rows} (expected: 6 for 5 items + header)`);
    if (milestones.rows < 6) {
      console.log('  ⚠️  WARNING: Milestones may be collapsed into single row');
    } else {
      console.log('  ✓  OK: Multiple rows rendered');
    }

    // Check success metrics (should have 3 data rows + 1 header = 4 total)
    const metrics = countTableRows(xml, 'Success Metrics');
    console.log(`Success Metrics table rows: ${metrics.rows} (expected: 4 for 3 items + header)`);
    if (metrics.rows < 4) {
      console.log('  ⚠️  WARNING: Success Metrics may be collapsed into single row');
    } else {
      console.log('  ✓  OK: Multiple rows rendered');
    }

    // Check core team (should have 4 data rows + 1 header = 5 total)
    const team = countTableRows(xml, 'Core Team');
    console.log(`Core Team table rows: ${team.rows} (expected: 5 for 4 items + header)`);
    if (team.rows < 5) {
      console.log('  ⚠️  WARNING: Core Team may be collapsed into single row');
    } else {
      console.log('  ✓  OK: Multiple rows rendered');
    }

    // Check if template tags remain unresolved
    const unresolvedTags = xml.match(/\{\{[^}]+\}\}/g) || [];
    const unresolvedBraces = xml.match(/\{[#/]?[a-z_]+\}/g) || [];
    if (unresolvedTags.length > 0 || unresolvedBraces.length > 0) {
      console.log(`\n⚠️  Unresolved template tags found:`);
      [...unresolvedTags, ...unresolvedBraces].forEach(tag => console.log(`   ${tag}`));
    } else {
      console.log('\n✓  All template tags resolved');
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Test complete. Check the rendered .docx files in templates/test-output/');
  console.log('='.repeat(60));
}

main().catch(console.error);
