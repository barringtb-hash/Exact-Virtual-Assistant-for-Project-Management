#!/usr/bin/env node
import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const [,, mode, targetPathArg] = process.argv;

const base64Path = path.join(__dirname, 'project_charter_tokens.docx.b64');
const docxPath = targetPathArg
  ? path.resolve(process.cwd(), targetPathArg)
  : path.join(__dirname, 'project_charter_tokens.docx');

async function decodeTemplate(outputPath) {
  const base64 = await readFile(base64Path, 'utf8');
  const buffer = Buffer.from(base64.trim(), 'base64');
  await writeFile(outputPath, buffer);
  console.log(`Wrote DOCX template to ${outputPath}`);
}

async function encodeTemplate(inputPath) {
  const buffer = await readFile(inputPath);
  const base64 = buffer.toString('base64');
  await writeFile(base64Path, base64);
  console.log(`Updated base64 template from ${inputPath}`);
}

async function main() {
  if (mode === 'decode') {
    await decodeTemplate(docxPath);
    return;
  }

  if (mode === 'encode') {
    await encodeTemplate(docxPath);
    return;
  }

  console.error('Usage: node sync-charter-template.mjs <encode|decode> [docxPath]');
  console.error('  encode: Read DOCX from path (default: templates/project_charter_tokens.docx) and update the base64 store.');
  console.error('  decode: Write DOCX file to path (default: templates/project_charter_tokens.docx) from the base64 store.');
  process.exit(1);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
