import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const stubRoot = path.join(__dirname, "_stubs", "packages");
const nodeModulesRoot = path.join(process.cwd(), "node_modules");

const stubPackages = [
  "pizzip",
  "docxtemplater",
  "mustache",
  "puppeteer-core",
  "@sparticuz/chromium",
  "ajv",
  "ajv-formats",
  "openai",
];

await fs.mkdir(nodeModulesRoot, { recursive: true });

for (const pkg of stubPackages) {
  const parts = pkg.split("/");
  const source = path.join(stubRoot, ...parts);
  const target = path.join(nodeModulesRoot, ...parts);

  try {
    await fs.access(target);
    continue;
  } catch {
    // target missing; fall through to copy stub
  }

  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.cp(source, target, { recursive: true, force: true });
}
