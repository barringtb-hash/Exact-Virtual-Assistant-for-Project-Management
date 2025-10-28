#!/usr/bin/env node
import { readFile } from 'fs/promises';

const [, , templatePathArg] = process.argv;
const templatePath = templatePathArg || new URL('./project_charter_tokens.docx.b64', import.meta.url).pathname;

async function loadTemplate(path) {
  try {
    const contents = await readFile(path, 'utf8');
    return Buffer.from(contents.trim(), 'base64');
  } catch (error) {
    console.error(`Failed to read template at ${path}: ${error.message}`);
    process.exit(1);
  }
}

async function loadLibraries() {
  try {
    const [{ default: Docxtemplater }, { default: PizZip }] = await Promise.all([
      import('docxtemplater'),
      import('pizzip'),
    ]);

    let inspectModuleFactory = null;
    try {
      const inspectModule = await import('docxtemplater/js/inspect-module.js');
      inspectModuleFactory = inspectModule.default;
    } catch (error) {
      if (!['ERR_MODULE_NOT_FOUND', 'MODULE_NOT_FOUND'].includes(error.code)) {
        console.warn('docxtemplater inspect module unavailable:', error.message);
      }
    }

    return { Docxtemplater, PizZip, inspectModuleFactory };
  } catch (error) {
    console.error('Unable to load docxtemplater dependencies. Install project dependencies with `npm install` before running this check.');
    console.error(error.message);
    process.exit(1);
  }
}

function buildSampleData() {
  return {
    project_name: 'Example Project',
    sponsor: 'Sample Sponsor',
    project_lead: 'Lead Name',
    start_date: '2024-01-01',
    end_date: '2024-06-30',
    vision: 'Deliver transformative value.',
    problem: 'Current process is manual and error-prone.',
    description: 'This initiative automates the workflow.',
    scope_in: ['Requirement discovery', 'MVP delivery'],
    scope_out: ['Legacy system retirement'],
    risks: ['Resource constraints'],
    assumptions: ['Executive support is available'],
    milestones: [
      { phase: 'Discovery', deliverable: 'Process map', date: '2024-02-01' },
      { phase: 'Delivery', deliverable: 'Beta launch', date: '2024-05-15' }
    ],
    success_metrics: [
      { benefit: 'Cycle time reduction', metric: 'Average processing time', system_of_measurement: 'Minutes' },
      { benefit: 'Cost savings', metric: 'Operational spend', system_of_measurement: 'USD/month' }
    ],
    core_team: [
      { name: 'Alex Kim', role: 'Product Manager', responsibilities: 'Roadmap ownership' },
      { name: 'Taylor Lee', role: 'Tech Lead', responsibilities: 'Architecture decisions' }
    ]
  };
}

function formatError(error) {
  if (error.properties && Array.isArray(error.properties.errors)) {
    return error.properties.errors.map((err) => `${err.properties.explanation}`).join('\n');
  }
  return error.message;
}

async function main() {
  const buffer = await loadTemplate(templatePath);
  const { Docxtemplater, PizZip, inspectModuleFactory } = await loadLibraries();
  const zip = new PizZip(buffer);
  const inspector = typeof inspectModuleFactory === 'function' ? inspectModuleFactory() : null;

  let doc;
  try {
    doc = new Docxtemplater(zip, {
      modules: inspector ? [inspector] : [],
      paragraphLoop: true,
      linebreaks: true,
    });
  } catch (error) {
    console.error(`Failed to parse template: ${error.message}`);
    process.exit(1);
  }

  try {
    doc.render(buildSampleData());
  } catch (error) {
    console.error('Template rendering failed:');
    console.error(formatError(error));
    process.exit(1);
  }

  if (inspector && typeof inspector.getAllErrors === 'function') {
    const errors = inspector.getAllErrors();
    if (errors.length > 0) {
      console.error('Template inspection failed with the following issues:');
      for (const err of errors) {
        console.error(`- ${err.error}`);
      }
      process.exit(1);
    }
  }

  console.log('Template validation succeeded.');
}

main();
