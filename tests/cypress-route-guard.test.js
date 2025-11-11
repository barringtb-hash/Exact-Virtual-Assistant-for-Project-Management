import { test } from "node:test";
import { strict as assert } from "node:assert";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("Cypress harness routes must match app assistant client routes", async () => {
  // Read the harness file
  const harnessPath = path.join(__dirname, "..", "cypress", "harness", "server.ts");
  const harnessContent = await fs.readFile(harnessPath, "utf-8");

  // Read the assistant client file
  const clientPath = path.join(__dirname, "..", "src", "lib", "assistantClient.ts");
  const clientContent = await fs.readFile(clientPath, "utf-8");

  // Extract routes from assistant client
  const clientStartMatch = clientContent.match(/fetch\("([^"]*\/charter\/start)"/);
  const clientMessagesMatch = clientContent.match(/fetch\("([^"]*\/charter\/messages)"/);
  const clientStreamMatch = clientContent.match(/`([^`]*\/charter\/stream[^`]*)`/);

  assert.ok(clientStartMatch, "Could not find charter start route in assistantClient.ts");
  assert.ok(clientMessagesMatch, "Could not find charter messages route in assistantClient.ts");
  assert.ok(clientStreamMatch, "Could not find charter stream route in assistantClient.ts");

  const clientStartRoute = clientStartMatch[1];
  const clientMessagesRoute = clientMessagesMatch[1];
  const clientStreamRoute = clientStreamMatch[1].replace(/\$\{[^}]+\}/g, ""); // Remove template vars

  // Verify harness routes include the correct paths
  assert.ok(
    harnessContent.includes("/api/assistant/charter/start"),
    `Harness must intercept ${clientStartRoute} (found in assistantClient.ts)`
  );
  assert.ok(
    harnessContent.includes("/api/assistant/charter/messages"),
    `Harness must intercept ${clientMessagesRoute} (found in assistantClient.ts)`
  );
  assert.ok(
    harnessContent.includes("/api/assistant/charter/stream"),
    "Harness must intercept /api/assistant/charter/stream (found in assistantClient.ts)"
  );

  // Ensure we're NOT using the old /guided/ routes
  assert.ok(
    !harnessContent.includes('"/guided/charter/') && !harnessContent.includes("'**/guided/charter/"),
    "Harness must NOT use legacy /guided/charter/ routes"
  );

  // Ensure we do not register a generic/methodless intercept for START_URL
  // which would capture the request before the POST stub and break cy.wait('@charterStart').
  const methodlessInterceptForStart =
    /cy\.intercept\(\s*\{\s*url:\s*(?:START_URL|CHARTER_ROUTES\.start)\s*\}\s*\)/.test(harnessContent);
  assert.ok(
    !methodlessInterceptForStart,
    "Do not use a methodless cy.intercept({ url: START_URL }) or cy.intercept({ url: CHARTER_ROUTES.start }) in the harness - it will short-circuit the POST stub"
  );
});
