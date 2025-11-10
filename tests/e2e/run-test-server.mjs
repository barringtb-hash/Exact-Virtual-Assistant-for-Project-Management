import { register } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../..");

register(new URL("../jsx-loader.mjs", import.meta.url));

console.log(
  `[run-test-server] booting Playwright test server on port ${process.env.PLAYWRIGHT_TEST_PORT || 4010}`
);

await import("./test-server.mjs");
