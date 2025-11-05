#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import {
  listScenarioTranscripts,
  loadScenario,
  runScenario,
} from "../tests/qa/charter-wizard/runner.mjs";

function printUsage() {
  console.log(`Usage: node scripts/run-golden-conversations.mjs [options]

Options:
  --output <dir>      Directory for golden artifacts (default: tmp/golden-conversations)
  --scenario <slug>   Run a single scenario slug (repeatable)
  --help              Show this message
`);
}

async function main() {
  const args = process.argv.slice(2);
  let outputDir = "tmp/golden-conversations";
  const include = new Set();

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--output": {
        const next = args[index + 1];
        if (!next) {
          console.error("Missing value for --output");
          process.exit(1);
        }
        outputDir = next;
        index += 1;
        break;
      }
      case "--scenario":
      case "--include": {
        const next = args[index + 1];
        if (!next) {
          console.error("Missing value for --scenario");
          process.exit(1);
        }
        include.add(next);
        index += 1;
        break;
      }
      case "--help":
      case "-h": {
        printUsage();
        process.exit(0);
        break;
      }
      default: {
        console.error(`Unknown option: ${arg}`);
        printUsage();
        process.exit(1);
      }
    }
  }

  const transcripts = await listScenarioTranscripts();
  const filtered = transcripts.filter((entry) =>
    include.size === 0 || include.has(entry.slug)
  );

  if (filtered.length === 0) {
    console.error("No matching scenarios found.");
    process.exit(1);
  }

  const outputRoot = path.resolve(process.cwd(), outputDir);
  await fs.rm(outputRoot, { recursive: true, force: true });
  await fs.mkdir(outputRoot, { recursive: true });

  console.log(`Running ${filtered.length} charter wizard golden scenarios at deterministic temperature 0...`);

  const summaries = [];
  for (const [index, entry] of filtered.entries()) {
    const scenario = await loadScenario(entry.path);
    const result = await runScenario(scenario);
    const scenarioDir = path.join(outputRoot, scenario.slug);
    await fs.mkdir(scenarioDir, { recursive: true });

    await fs.writeFile(
      path.join(scenarioDir, "result.json"),
      JSON.stringify(result, null, 2),
      "utf8",
    );
    await fs.writeFile(
      path.join(scenarioDir, "telemetry.json"),
      JSON.stringify(result.telemetryEvents, null, 2),
      "utf8",
    );
    await fs.writeFile(
      path.join(scenarioDir, "document.json"),
      JSON.stringify(result.finalDocument, null, 2),
      "utf8",
    );
    await fs.writeFile(
      path.join(scenarioDir, "validation-attempts.json"),
      JSON.stringify(result.validationAttempts, null, 2),
      "utf8",
    );

    summaries.push({
      slug: scenario.slug,
      steps: result.steps.length,
      output: scenarioDir,
    });
    console.log(
      `  [${index + 1}/${filtered.length}] ${scenario.slug} -> ${path.relative(process.cwd(), scenarioDir)}`,
    );
  }

  console.log("\nGolden run complete. Artifacts:");
  for (const summary of summaries) {
    console.log(`- ${summary.slug}: ${summary.steps} steps -> ${path.relative(process.cwd(), summary.output)}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
