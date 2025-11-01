import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import process from "process";

import { renderDocxBuffer } from "../../api/charter/render.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");

async function main() {
  const [payloadArg, outputArg] = process.argv.slice(2);

  const payloadPath = payloadArg
    ? path.resolve(process.cwd(), payloadArg)
    : path.join(projectRoot, "samples", "charter.smoke.json");

  const outputPath = outputArg
    ? path.resolve(process.cwd(), outputArg)
    : path.join(projectRoot, "samples", "charter.smoke.docx");

  const payloadRaw = await fs.readFile(payloadPath, "utf8");
  const payload = JSON.parse(payloadRaw);

  const buffer = await renderDocxBuffer(payload);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, buffer);
  const stats = await fs.stat(outputPath);

  console.log(`Rendered charter to ${outputPath} (${stats.size} bytes)`);
}

main().catch((error) => {
  console.error("Failed to render charter smoke DOCX", error);
  process.exitCode = 1;
});
