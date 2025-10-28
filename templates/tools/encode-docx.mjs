#!/usr/bin/env node

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const defaultDocxPath = path.resolve(__dirname, '..', 'project_charter_tokens.docx');
const inputArg = process.argv[2];
const sourcePath = inputArg ? path.resolve(process.cwd(), inputArg) : defaultDocxPath;
const outputPath = `${sourcePath}.b64`;

async function encodeDocx() {
  try {
    const data = await fs.readFile(sourcePath);
    const base64 = data.toString('base64');
    await fs.writeFile(outputPath, base64);
    const relativeSource = path.relative(process.cwd(), sourcePath) || path.basename(sourcePath);
    const relativeOutput = path.relative(process.cwd(), outputPath) || path.basename(outputPath);
    console.log(`Encoded ${relativeSource} (${data.byteLength} bytes) -> ${relativeOutput}`);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error(`Input DOCX not found: ${sourcePath}`);
      process.exitCode = 1;
      return;
    }
    console.error('Failed to encode DOCX:', error);
    process.exitCode = 1;
  }
}

encodeDocx();
