#!/usr/bin/env node
/**
 * Fix Charter Template
 *
 * This script creates a corrected DOCX template with proper loop structures
 * for docxtemplater. The key fixes:
 *
 * 1. Table row loops - opening/closing tags wrap entire rows
 * 2. List items - each item on its own line with paragraph loop
 * 3. Proper XML namespace handling
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.resolve(__dirname, '..');

// OOXML namespaces
const NS = {
  w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
};

// Helper to create XML elements
function el(tag, attrs = {}, children = '') {
  const attrStr = Object.entries(attrs)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ');
  return `<${tag}${attrStr ? ' ' + attrStr : ''}>${children}</${tag}>`;
}

// Create a text run
function textRun(text, bold = false) {
  const rPr = bold ? '<w:rPr><w:b/></w:rPr>' : '';
  return `<w:r>${rPr}<w:t>${escapeXml(text)}</w:t></w:r>`;
}

// Create a paragraph
function para(content, style = null) {
  const pPr = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : '';
  return `<w:p>${pPr}${content}</w:p>`;
}

// Create a table cell
function tc(width, content) {
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/></w:tcPr>${content}</w:tc>`;
}

// Create a table row
function tr(cells) {
  return `<w:tr>${cells}</w:tr>`;
}

// Escape XML special characters
function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Create the header info table (scalar fields)
function createHeaderTable() {
  const rows = [
    ['Project Name', '{{project_name}}'],
    ['Sponsor', '{{sponsor}}'],
    ['Project Lead', '{{project_lead}}'],
    ['Estimated Project Start Date', '{{start_date}}'],
    ['Estimated Project End Date', '{{end_date}}'],
    ['Project Vision', '{{vision}}'],
    ['Problem / Opportunity', '{{problem}}'],
    ['Project Description', '{{description}}'],
  ];

  const tableRows = rows.map(([label, token]) =>
    tr(
      tc(3600, para(textRun(label))) +
      tc(8400, para(textRun(token)))
    )
  ).join('');

  return `<w:tbl>
    <w:tblPr>
      <w:tblW w:w="0" w:type="auto"/>
      <w:tblBorders>
        <w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>
        <w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>
        <w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>
        <w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>
        <w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/>
        <w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/>
      </w:tblBorders>
      <w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="0"/>
    </w:tblPr>
    <w:tblGrid>
      <w:gridCol w:w="3600"/>
      <w:gridCol w:w="8400"/>
    </w:tblGrid>
    ${tableRows}
  </w:tbl>`;
}

// Create a section with bulleted list (for scope, risks, assumptions)
function createListSection(title, loopVar) {
  // Using paragraphLoop mode - each array item creates a new paragraph
  return `
    <w:p/>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr>${textRun(title)}</w:p>
    <w:p>${textRun(`{#${loopVar}}`)}</w:p>
    <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>${textRun('{.}')}</w:p>
    <w:p>${textRun(`{/${loopVar}}`)}</w:p>`;
}

// Create milestones table with proper row looping
function createMilestonesTable() {
  return `
    <w:p/>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr>${textRun('Milestones and Key Deliverables')}</w:p>
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="0" w:type="auto"/>
        <w:tblBorders>
          <w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>
          <w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>
          <w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>
          <w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>
          <w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/>
          <w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/>
        </w:tblBorders>
        <w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="0"/>
      </w:tblPr>
      <w:tblGrid>
        <w:gridCol w:w="4000"/>
        <w:gridCol w:w="4800"/>
        <w:gridCol w:w="3200"/>
      </w:tblGrid>
      ${tr(
        tc(4000, para(textRun('Phase', true))) +
        tc(4800, para(textRun('Milestone / Key Deliverable', true))) +
        tc(3200, para(textRun('Target Date', true)))
      )}
      ${tr(
        tc(4000, para(textRun('{#milestones}{phase}'))) +
        tc(4800, para(textRun('{deliverable}'))) +
        tc(3200, para(textRun('{date}{/milestones}')))
      )}
    </w:tbl>`;
}

// Create success metrics table with proper row looping
function createSuccessMetricsTable() {
  return `
    <w:p/>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr>${textRun('Success Metrics')}</w:p>
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="0" w:type="auto"/>
        <w:tblBorders>
          <w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>
          <w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>
          <w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>
          <w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>
          <w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/>
          <w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/>
        </w:tblBorders>
        <w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="0"/>
      </w:tblPr>
      <w:tblGrid>
        <w:gridCol w:w="4800"/>
        <w:gridCol w:w="3600"/>
        <w:gridCol w:w="3600"/>
      </w:tblGrid>
      ${tr(
        tc(4800, para(textRun('Business Benefit', true))) +
        tc(3600, para(textRun('Metric', true))) +
        tc(3600, para(textRun('System of Measurement', true)))
      )}
      ${tr(
        tc(4800, para(textRun('{#success_metrics}{benefit}'))) +
        tc(3600, para(textRun('{metric}'))) +
        tc(3600, para(textRun('{system_of_measurement}{/success_metrics}')))
      )}
    </w:tbl>`;
}

// Create core team table with proper row looping
function createCoreTeamTable() {
  return `
    <w:p/>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr>${textRun('Core Team')}</w:p>
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="0" w:type="auto"/>
        <w:tblBorders>
          <w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>
          <w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>
          <w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>
          <w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>
          <w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/>
          <w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/>
        </w:tblBorders>
        <w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="0"/>
      </w:tblPr>
      <w:tblGrid>
        <w:gridCol w:w="3600"/>
        <w:gridCol w:w="3600"/>
        <w:gridCol w:w="4800"/>
      </w:tblGrid>
      ${tr(
        tc(3600, para(textRun('Name', true))) +
        tc(3600, para(textRun('Role', true))) +
        tc(4800, para(textRun('Project Responsibilities', true)))
      )}
      ${tr(
        tc(3600, para(textRun('{#core_team}{name}'))) +
        tc(3600, para(textRun('{role}'))) +
        tc(4800, para(textRun('{responsibilities}{/core_team}')))
      )}
    </w:tbl>`;
}

// Build the complete document.xml
function buildDocumentXml() {
  const namespaces = `xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
 xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
 xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
 xmlns:v="urn:schemas-microsoft-com:vml"
 xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"
 xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
 xmlns:w10="urn:schemas-microsoft-com:office:word"
 xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
 xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
 xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"
 xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk"
 xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"
 xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
 mc:Ignorable="w14 wp14"`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${namespaces}>
  <w:body>
    ${para(textRun('Project Charter'), 'Title')}
    ${createHeaderTable()}
    ${createListSection('In Scope', 'scope_in')}
    ${createListSection('Out of Scope', 'scope_out')}
    ${createListSection('Project Risks / Constraints', 'risks')}
    ${createListSection('Assumptions', 'assumptions')}
    ${createMilestonesTable()}
    ${createSuccessMetricsTable()}
    ${createCoreTeamTable()}
    <w:p/>
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

async function main() {
  console.log('Building corrected charter template document.xml...');

  const documentXml = buildDocumentXml();

  // Write the XML for inspection
  const outputPath = path.join(TEMPLATES_DIR, 'charter', 'document.xml.preview');
  await fs.writeFile(outputPath, documentXml, 'utf8');
  console.log(`Preview XML written to: ${outputPath}`);

  // Now we need to create the actual DOCX file
  // We'll read the existing template and replace document.xml
  const existingB64 = await fs.readFile(
    path.join(TEMPLATES_DIR, 'project_charter_tokens.docx.b64'),
    'utf8'
  );
  const existingBuffer = Buffer.from(existingB64.trim(), 'base64');

  // Use PizZip to modify the DOCX
  const PizZip = (await import('pizzip')).default;
  const zip = new PizZip(existingBuffer);

  // Replace document.xml
  zip.file('word/document.xml', documentXml);

  // Generate new DOCX buffer
  const newBuffer = zip.generate({ type: 'nodebuffer' });

  // Write the new DOCX
  const newDocxPath = path.join(TEMPLATES_DIR, 'project_charter_tokens_fixed.docx');
  await fs.writeFile(newDocxPath, newBuffer);
  console.log(`New DOCX written to: ${newDocxPath}`);

  // Encode to base64
  const newB64 = newBuffer.toString('base64');
  const newB64Path = path.join(TEMPLATES_DIR, 'project_charter_tokens_fixed.docx.b64');
  await fs.writeFile(newB64Path, newB64, 'utf8');
  console.log(`New base64 written to: ${newB64Path}`);

  console.log('\nTo use the fixed template:');
  console.log('  mv templates/project_charter_tokens.docx.b64 templates/project_charter_tokens.docx.b64.backup');
  console.log('  mv templates/project_charter_tokens_fixed.docx.b64 templates/project_charter_tokens.docx.b64');
}

main().catch(console.error);
