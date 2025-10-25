import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import fs from 'fs/promises';
import path from 'path';

// Load the schema once at startup
const schemaPromise = fs
  .readFile(path.join(process.cwd(), 'templates', 'charter.schema.json'), 'utf-8')
  .then(JSON.parse);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  const data = req.body;
  const schema = await schemaPromise;
  const ajv = new Ajv({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const valid = validate(data);
  if (!valid) {
    return res.status(400).json({ errors: validate.errors });
  }
  return res.status(200).json({ ok: true });
}
