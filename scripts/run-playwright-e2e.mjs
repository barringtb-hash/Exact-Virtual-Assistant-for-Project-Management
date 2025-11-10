import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";
import killPort from "kill-port";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const PLAYWRIGHT_CLI = path.join(projectRoot, "node_modules", ".bin", "playwright");

const PROJECTS = [
  { name: "api", port: 4010, docRouterEnabled: false },
  { name: "chromium-doc-router-off", port: 4011, docRouterEnabled: false },
  { name: "chromium-doc-router-on", port: 4012, docRouterEnabled: true },
];

async function main() {
  for (const project of PROJECTS) {
    const server = await startServer(project);
    try {
      const exitCode = await runPlaywright(project.name);
      if (exitCode !== 0) {
        process.exitCode = exitCode;
        break;
      }
    } finally {
      await stopServer(server);
    }
  }

  if (process.exitCode) {
    process.exit(process.exitCode);
  }
}

async function startServer({ port, docRouterEnabled }) {
  console.log(`\n[run-playwright-e2e] starting server for port ${port}`);
  try {
    await killPort(port);
  } catch (error) {
    if (error && error.code !== "ERR_PORT_NOT_IN_USE") {
      console.warn(`[run-playwright-e2e] kill-port warning for ${port}`, error);
    }
  }
  const child = spawn(process.execPath, ["tests/e2e/run-test-server.mjs"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      FILES_LINK_SECRET: process.env.FILES_LINK_SECRET || "playwright-secret",
      PLAYWRIGHT_TEST_PORT: String(port),
      VITE_ENABLE_DOC_ROUTER: docRouterEnabled ? "1" : "0",
      VITE_CHARTER_GUIDED_CHAT_ENABLED: "true",
      VITE_CHARTER_GUIDED_BACKEND: "on",
      VITE_CHARTER_WIZARD_VISIBLE: "false",
      VITE_AUTO_EXTRACTION_ENABLED: "false",
      VITE_CYPRESS_SAFE_MODE: "true",
    },
    stdio: ["ignore", "inherit", "inherit"],
  });

  await waitForHealth(port);
  return child;
}

async function stopServer(child) {
  if (!child || child.killed) {
    return;
  }
  child.kill("SIGTERM");
  try {
    await once(child, "exit");
  } catch (error) {
    console.error("[run-playwright-e2e] error stopping server", error);
  }
}

async function runPlaywright(projectName) {
  console.log(`\n[run-playwright-e2e] running project ${projectName}`);
  return await new Promise((resolve) => {
    const child = spawn(PLAYWRIGHT_CLI, ["test", "--project", projectName], {
      cwd: projectRoot,
      stdio: "inherit",
      env: process.env,
    });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

async function waitForHealth(port) {
  const deadline = Date.now() + 60_000;
  const url = `http://127.0.0.1:${port}/api/charter/health`;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) {
        return;
      }
    } catch (error) {
      if (error && error.code && error.code !== "ECONNREFUSED") {
        console.warn(`[run-playwright-e2e] health check error on port ${port}`, error);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for server on port ${port}`);
}

main().catch((error) => {
  console.error("[run-playwright-e2e] fatal error", error);
  process.exit(1);
});
