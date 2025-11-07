import fs from 'fs/promises';
import path from 'path';
import { globby } from 'globby';
import yaml from 'js-yaml';
import chalk from 'chalk';

interface CliOptions {
  check: boolean;
  maxFlaky: number;
}

interface RawMetadata {
  scenario?: string;
  feature?: string;
  subsystem?: string;
  envs?: string[] | string;
  risk?: string;
  owner?: string;
  ci_suites?: string[] | string;
  flaky?: boolean;
  needs_review?: boolean;
  preconditions?: string[];
  data_setup?: string;
  refs?: string[] | string;
}

interface ScenarioRecord {
  filePath: string;
  scenario: string;
  feature: string;
  subsystem: string;
  envs: string[];
  risk: string;
  owner: string;
  ci_suites: string[];
  flaky: boolean;
  needs_review: boolean;
  preconditions: string[];
  data_setup: string;
  refs: string[];
  data_testids: string[];
  quarantine?: QuarantineEntry;
  missingHeader: boolean;
}

interface QuarantineEntry {
  scenario: string;
  reason: string;
  since: string;
}

interface QuarantineFile {
  entries?: QuarantineEntry[];
}

interface SuiteConfigEntry {
  description?: string;
  workflows?: string[];
  jobs?: string[];
  env?: Record<string, string>;
}

type SuiteConfig = Record<string, SuiteConfigEntry>;

const DEFAULT_SUITE_CONFIG: SuiteConfig = {};

const FRONT_MATTER_REGEX = /^\s*\/\*\*\s*\r?\n---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n\*\//;

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
  const quarantine = await readQuarantine(path.join(repoRoot, 'tests/.quarantine.json'));
  const suiteConfig = await readSuiteConfig(path.join(repoRoot, 'config/test-suites.config.json'));

  const patterns = [
    'cypress/e2e/**/*.cy.{ts,tsx,js,jsx}',
    'src/**/*.{spec,test}.{ts,tsx,js,jsx}',
    'tests/**/*.{spec,test}.{ts,tsx,js,jsx}',
  ];

  const files = await globby(patterns, { gitignore: true });

  const scenarios: ScenarioRecord[] = [];
  const missingHeaders: string[] = [];
  const duplicates = new Map<string, string[]>();

  for (const filePath of files) {
    const absolute = path.join(repoRoot, filePath);
    const raw = await fs.readFile(absolute, 'utf8');
    const { metadata, missingHeader } = extractMetadata(raw);
    if (missingHeader) {
      missingHeaders.push(filePath);
    }

    const scenario = normalizeScenario(metadata.scenario, raw, filePath);
    const record: ScenarioRecord = {
      filePath,
      scenario,
      feature: (metadata.feature ?? 'unknown').toLowerCase(),
      subsystem: (metadata.subsystem ?? 'unknown').toLowerCase(),
      envs: normalizeArray(metadata.envs),
      risk: (metadata.risk ?? 'unknown').toLowerCase(),
      owner: metadata.owner ?? 'unassigned',
      ci_suites: normalizeArray(metadata.ci_suites),
      flaky: Boolean(metadata.flaky),
      needs_review: Boolean(metadata.needs_review),
      preconditions: metadata.preconditions && metadata.preconditions.length > 0 ? metadata.preconditions : [],
      data_setup: metadata.data_setup ?? 'unspecified',
      refs: normalizeArray(metadata.refs),
      data_testids: collectDataTestIds(raw),
      quarantine: findQuarantine(quarantine, scenario),
      missingHeader,
    };

    scenarios.push(record);

    const dupeList = duplicates.get(record.scenario) ?? [];
    dupeList.push(filePath);
    duplicates.set(record.scenario, dupeList);
  }

  scenarios.sort((a, b) => a.scenario.localeCompare(b.scenario));

  const duplicateEntries = Array.from(duplicates.entries()).filter(([, paths]) => paths.length > 1);

  const flakyCount = scenarios.filter((s) => s.flaky || s.quarantine).length;
  const errors: string[] = [];

  if (missingHeaders.length > 0) {
    errors.push(`Missing metadata headers in: ${missingHeaders.join(', ')}`);
  }

  if (duplicateEntries.length > 0) {
    const list = duplicateEntries.map(([scenarioName, paths]) => `${scenarioName} (${paths.join(', ')})`).join('; ');
    errors.push(`Duplicate scenario names detected: ${list}`);
  }

  if (flakyCount > options.maxFlaky) {
    errors.push(`Flaky/quarantined scenarios (${flakyCount}) exceed threshold (${options.maxFlaky}).`);
  }

  const existingGeneratedAt = await readGeneratedAt(path.join(repoRoot, 'docs/test-scenarios.json'));
  const generatedAt = options.check && existingGeneratedAt ? existingGeneratedAt : new Date().toISOString();

  const summary = buildSummary(scenarios);
  const mermaidGraph = buildMermaidGraph(scenarios);
  const matrixDoc = ['```mermaid', mermaidGraph, '```', ''].join('\n');
  const mdDoc = buildMarkdownCatalog(scenarios, summary, matrixDoc, suiteConfig, generatedAt);
  const jsonDoc = JSON.stringify({ generatedAt, scenarios }, null, 2) + '\n';

  const outputs = [
    { file: path.join(repoRoot, 'docs/test-matrix.md'), content: matrixDoc },
    { file: path.join(repoRoot, 'docs/TEST_SCENARIO_CATALOG.md'), content: mdDoc },
    { file: path.join(repoRoot, 'docs/test-scenarios.json'), content: jsonDoc },
  ];

  if (options.check) {
    const stale: string[] = [];
    for (const output of outputs) {
      const current = await readFileOrNull(output.file);
      if (current !== output.content) {
        stale.push(path.relative(repoRoot, output.file));
      }
    }
    if (stale.length > 0) {
      errors.push(`Generated artifacts are stale: ${stale.join(', ')}`);
    }
  } else {
    for (const output of outputs) {
      await fs.mkdir(path.dirname(output.file), { recursive: true });
      await fs.writeFile(output.file, output.content, 'utf8');
    }
  }

  logSummary(scenarios, summary);

  if (errors.length > 0) {
    errors.forEach((err) => console.error(chalk.red(`✖ ${err}`)));
    process.exitCode = 1;
  } else {
    console.log(chalk.green('✔ Test scenario catalog generated successfully.'));
  }
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { check: false, maxFlaky: 5 };
  for (const arg of argv) {
    if (arg === '--check') {
      options.check = true;
    } else if (arg.startsWith('--max-flaky=')) {
      const value = Number(arg.split('=')[1]);
      if (!Number.isNaN(value)) {
        options.maxFlaky = value;
      }
    }
  }
  return options;
}

function extractMetadata(raw: string): { metadata: RawMetadata; missingHeader: boolean } {
  const match = raw.match(FRONT_MATTER_REGEX);
  if (!match) {
    return {
      metadata: {
        scenario: undefined,
        needs_review: true,
      },
      missingHeader: true,
    };
  }

  const yamlSource = match[1];
  try {
    const parsed = (yaml.load(yamlSource) ?? {}) as RawMetadata;
    return { metadata: parsed, missingHeader: false };
  } catch (error) {
    console.warn(chalk.yellow('⚠ Unable to parse metadata front matter:'), error);
    return {
      metadata: {
        scenario: undefined,
        needs_review: true,
      },
      missingHeader: true,
    };
  }
}

function normalizeScenario(scenario: string | undefined, raw: string, filePath: string): string {
  if (scenario && scenario.trim().length > 0) {
    return scenario.trim();
  }
  const describeMatch = raw.match(/describe\((['"])(.*?)\1/);
  if (describeMatch && describeMatch[2]) {
    return describeMatch[2];
  }
  const itMatch = raw.match(/it\((['"])(.*?)\1/);
  if (itMatch && itMatch[2]) {
    return itMatch[2];
  }
  return path.basename(filePath);
}

function normalizeArray(value: string[] | string | undefined): string[] {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map((v) => `${v}`.trim()).filter(Boolean);
  }
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function collectDataTestIds(raw: string): string[] {
  const regex = /data-testid\s*=\s*(["'`])([^"'`]+)\1/gi;
  const ids = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = regex.exec(raw))) {
    ids.add(match[2]);
  }
  return Array.from(ids).sort();
}

function findQuarantine(quarantine: QuarantineFile, scenario: string): QuarantineEntry | undefined {
  return quarantine.entries?.find((entry) => entry.scenario === scenario);
}

async function readQuarantine(filePath: string): Promise<QuarantineFile> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as QuarantineFile;
  } catch (error) {
    return { entries: [] };
  }
}

async function readSuiteConfig(filePath: string): Promise<SuiteConfig> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as SuiteConfig;
  } catch (error) {
    return DEFAULT_SUITE_CONFIG;
  }
}

async function readGeneratedAt(filePath: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as { generatedAt?: string };
    return parsed.generatedAt ?? null;
  } catch (error) {
    return null;
  }
}

function buildSummary(scenarios: ScenarioRecord[]) {
  const total = scenarios.length;
  const bySuite = new Map<string, number>();
  const byFeature = new Map<string, number>();
  const byEnv = new Map<string, number>();

  for (const scenario of scenarios) {
    const suites = scenario.ci_suites.length > 0 ? scenario.ci_suites : ['unmapped'];
    for (const suite of suites) {
      bySuite.set(suite, (bySuite.get(suite) ?? 0) + 1);
    }

    const feature = scenario.feature ?? 'unknown';
    byFeature.set(feature, (byFeature.get(feature) ?? 0) + 1);

    const envs = scenario.envs.length > 0 ? scenario.envs : ['unspecified'];
    for (const env of envs) {
      byEnv.set(env, (byEnv.get(env) ?? 0) + 1);
    }
  }

  return { total, bySuite, byFeature, byEnv };
}

function buildMermaidGraph(scenarios: ScenarioRecord[]): string {
  const nodes = new Map<string, string>();
  const edges = new Set<string>();

  for (const scenario of scenarios) {
    const featureId = slug(`feature-${scenario.feature}`);
    nodes.set(featureId, `"Feature: ${scenario.feature}"`);

    const envs = scenario.envs.length > 0 ? scenario.envs : ['unspecified'];
    const suites = scenario.ci_suites.length > 0 ? scenario.ci_suites : ['unmapped'];
    const scenarioId = slug(`scenario-${scenario.scenario}`);
    nodes.set(scenarioId, `"Scenario: ${scenario.scenario}"`);

    for (const env of envs) {
      const envId = slug(`env-${env}`);
      nodes.set(envId, `"Env: ${env}"`);
      edges.add(`${featureId} --> ${envId}`);

      for (const suite of suites) {
        const suiteId = slug(`suite-${suite}`);
        nodes.set(suiteId, `"Suite: ${suite}"`);
        edges.add(`${envId} --> ${suiteId}`);
        edges.add(`${suiteId} --> ${scenarioId}`);
      }
    }
  }

  const lines = ['graph TD'];
  for (const [id, label] of nodes.entries()) {
    lines.push(`  ${id}[${label}]`);
  }
  for (const edge of edges) {
    lines.push(`  ${edge}`);
  }
  return lines.join('\n');
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-/g, '_');
}

function renderTable(headers: string[], rows: string[][]): string {
  const headerLine = `| ${headers.join(' | ')} |`;
  const separator = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${row.join(' | ')} |`).join('\n');
  return [headerLine, separator, body].filter(Boolean).join('\n');
}

function buildMarkdownCatalog(
  scenarios: ScenarioRecord[],
  summary: ReturnType<typeof buildSummary>,
  matrixDoc: string,
  suiteConfig: SuiteConfig,
  generatedAt: string,
): string {
  const lines: string[] = [];
  lines.push('# Test Scenario Catalog');
  lines.push('');
  lines.push(`_Last updated: ${generatedAt}_`);
  lines.push('');
  lines.push('## Overview');
  lines.push('');
  lines.push(`- Total scenarios: ${summary.total}`);
  lines.push(`- Unique features: ${summary.byFeature.size}`);
  lines.push(`- Unique CI suites: ${summary.bySuite.size}`);
  lines.push('');

  lines.push('### Scenarios by CI suite');
  lines.push('');
  lines.push(
    renderTable(
      ['Suite', 'Count'],
      Array.from(summary.bySuite.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([suite, count]) => [suite, count.toString()]),
    ),
  );
  lines.push('');

  lines.push('### Scenarios by feature');
  lines.push('');
  lines.push(
    renderTable(
      ['Feature', 'Count'],
      Array.from(summary.byFeature.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([feature, count]) => [feature, count.toString()]),
    ),
  );
  lines.push('');

  lines.push('### Scenarios by environment');
  lines.push('');
  lines.push(
    renderTable(
      ['Environment', 'Count'],
      Array.from(summary.byEnv.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([env, count]) => [env, count.toString()]),
    ),
  );
  lines.push('');

  lines.push('## Feature × Environment × Suite matrix');
  lines.push('');
  lines.push(matrixDoc.trim());
  lines.push('');
  lines.push('## Critical flows (risk ≥ high)');
  lines.push('');
  const criticalRows = scenarios
    .filter((scenario) => scenario.risk === 'high' || scenario.risk === 'critical')
    .map((scenario) => [
      scenario.scenario,
      scenario.feature,
      scenario.ci_suites.join(', ') || '—',
      scenario.owner,
      scenario.filePath,
    ]);
  lines.push(
    criticalRows.length > 0
      ? renderTable(['Scenario', 'Feature', 'CI suites', 'Owner', 'File'], criticalRows)
      : '_No critical scenarios documented._',
  );
  lines.push('');

  lines.push('## Flaky / quarantined scenarios');
  lines.push('');
  const flakyRows = scenarios
    .filter((scenario) => scenario.flaky || scenario.quarantine)
    .map((scenario) => [
      scenario.scenario,
      scenario.flaky ? 'Yes' : 'No',
      scenario.quarantine ? scenario.quarantine.reason : '—',
      scenario.quarantine ? scenario.quarantine.since : '—',
      scenario.filePath,
    ]);
  lines.push(
    flakyRows.length > 0
      ? renderTable(['Scenario', 'Flaky', 'Quarantine reason', 'Since', 'File'], flakyRows)
      : '_No flaky or quarantined scenarios recorded._',
  );
  lines.push('');

  lines.push('## Complete scenario inventory');
  lines.push('');
  const inventoryRows = scenarios.map((scenario) => [
    scenario.scenario,
    scenario.feature,
    scenario.subsystem,
    scenario.envs.join(', ') || '—',
    scenario.risk,
    scenario.ci_suites.join(', ') || '—',
    scenario.owner,
    scenario.needs_review ? 'Yes' : 'No',
    scenario.filePath,
  ]);
  lines.push(
    renderTable(
      ['Scenario', 'Feature', 'Subsystem', 'Envs', 'Risk', 'CI suites', 'Owner', 'Needs review', 'File'],
      inventoryRows,
    ),
  );
  lines.push('');

  lines.push('## Selector hygiene (data-testid usage)');
  lines.push('');
  const selectorRows = scenarios
    .filter((scenario) => scenario.data_testids.length > 0)
    .map((scenario) => [scenario.scenario, scenario.data_testids.join(', ')]);
  lines.push(
    selectorRows.length > 0
      ? renderTable(['Scenario', 'data-testid values'], selectorRows)
      : '_No data-testid attributes detected in scenarios._',
  );
  lines.push('');

  lines.push('## CI suite mapping');
  lines.push('');
  const suiteRows = Object.entries(suiteConfig).map(([suite, meta]) => [
    suite,
    meta.description ?? '—',
    (meta.workflows ?? ['—']).join(', '),
    (meta.jobs ?? ['—']).join(', '),
    meta.env && Object.entries(meta.env).length > 0
      ? Object.entries(meta.env)
          .map(([key, value]) => `${key}=${value}`)
          .join('<br>')
      : '—',
  ]);
  lines.push(
    suiteRows.length > 0
      ? renderTable(['Suite', 'Description', 'Workflows', 'Jobs', 'Env vars'], suiteRows)
      : '_No CI suite metadata configured._',
  );
  lines.push('');

  lines.push('For Mermaid source see [test-matrix](./test-matrix.md).');
  lines.push('');
  return lines.join('\n');
}

async function readFileOrNull(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    return null;
  }
}

function logSummary(scenarios: ScenarioRecord[], summary: ReturnType<typeof buildSummary>) {
  console.log(chalk.cyan(`Scenarios discovered: ${summary.total}`));
  const flaky = scenarios.filter((s) => s.flaky || s.quarantine);
  if (flaky.length > 0) {
    console.log(chalk.yellow(`Flaky/quarantined: ${flaky.length}`));
  }
  console.log(chalk.cyan(`Features: ${Array.from(summary.byFeature.keys()).join(', ') || '—'}`));
}

main().catch((error) => {
  console.error(chalk.red('Unexpected error while generating test catalog'));
  console.error(error);
  process.exitCode = 1;
});
