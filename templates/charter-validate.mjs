#!/usr/bin/env node
/**
 * Validate a Project Charter JSON file against the charter schema.
 *
 * Usage: node charter-validate.mjs <path/to/json>
 * Returns exit code 0 if valid, 1 if invalid. Prints errors to stderr.
 */
import { readFile } from 'fs/promises';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import schema from './charter.schema.json' assert { type: 'json' };

async function validateFile(filePath) {
  const ajv = new Ajv({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  let data;
  try {
    const content = await readFile(filePath, { encoding: 'utf-8' });
    data = JSON.parse(content);
  } catch (err) {
    console.error(`Failed to read or parse JSON file: ${err.message}`);
    process.exit(1);
  }
  const valid = validate(data);
  if (!valid) {
    console.error('Validation failed with the following errors:');
    for (const error of validate.errors) {
      console.error(`- ${error.instancePath || '(root)'} ${error.message}`);
    }
    process.exit(1);
  }
  console.log('Validation succeeded.');
}

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node charter-validate.mjs <path/to/json>');
  process.exit(1);
}
validateFile(filePath).catch((err) => {
  console.error(err);
  process.exit(1);
});
