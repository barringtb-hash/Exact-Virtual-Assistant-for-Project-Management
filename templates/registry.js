import path from 'node:path';

const templatesDir = path.resolve(process.cwd(), 'templates');

export const templateRegistry = {
  charter: {
    schemaPath: path.join(templatesDir, 'charter.schema.json'),
    fieldRulesPath: path.join(templatesDir, 'field_rules.json'),
    extractPromptPath: path.join(templatesDir, 'extract_prompt.txt'),
    docxPath: path.join(templatesDir, 'project_charter_tokens.docx'),
    metadata: {
      encodedDocxPath: path.join(templatesDir, 'project_charter_tokens.docx.b64'),
    },
    outputFilename: 'project_charter.docx',
  },
};

export function getTemplateConfig(docType) {
  const normalizedDocType = String(docType || '').trim().toLowerCase();

  if (!normalizedDocType) {
    throw new Error('A document type must be provided.');
  }

  const config = templateRegistry[normalizedDocType];

  if (!config) {
    const available = Object.keys(templateRegistry).join(', ');
    throw new Error(`Unsupported document type: "${docType}". Available templates: ${available}.`);
  }

  return config;
}

export default templateRegistry;
