import { promises as fs } from "fs";
import path from "path";
import OpenAI from "openai";

function parseBody(req) {
  if (!req.body) {
    return {};
  }
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch (err) {
      return {};
    }
  }
  return req.body;
}

function captureFromLines(lines, label, hints = []) {
  const searchTerms = [label, ...(hints || [])].filter(Boolean).map((term) => term.toLowerCase());
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const normalized = line.toLowerCase();
    const matchedTerm = searchTerms.find((term) => normalized.includes(term));
    if (!matchedTerm) continue;

    let value = "";
    const colonIndex = line.indexOf(":");
    if (colonIndex !== -1 && colonIndex < line.length - 1) {
      value = line.slice(colonIndex + 1).trim();
    }

    if (!value) {
      const following = [];
      for (let offset = 1; offset <= 3 && i + offset < lines.length; offset += 1) {
        const candidate = lines[i + offset].trim();
        if (!candidate) break;
        following.push(candidate);
      }
      value = following.join("\n");
    }

    if (value) {
      return { value, matchedTerm };
    }
  }
  return null;
}

async function extractWithLLM(missingFields, text) {
  if (!missingFields.length) return {};
  if (!process.env.OPENAI_API_KEY) return {};

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const fieldLabels = missingFields.map((field) => field.label);
  const prompt = [
    "You are an assistant that extracts project management fields from documents.",
    "Return a JSON object with keys matching the requested labels and string values.",
    "If a value is not present, use an empty string.",
    `Labels: ${fieldLabels.join(", ")}`,
    "Document: \n" + text
  ].join("\n\n");

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        { role: "system", content: "You return JSON only." },
        { role: "user", content: prompt }
      ]
    });
    const raw = response.choices?.[0]?.message?.content || "";
    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) {
      return {};
    }
    const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
    return parsed;
  } catch (err) {
    console.warn("LLM extraction failed", err);
    return {};
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  try {
    const body = parseBody(req);
    const { rawDocument, useLLM = false } = body || {};
    const text = rawDocument?.text || "";
    const documentType = req.query?.documentType || req.params?.documentType;

    if (!documentType) {
      res.status(400).json({ error: "documentType is required" });
      return;
    }

    if (typeof documentType !== "string" || !/^[\w-]+$/.test(documentType)) {
      res.status(400).json({ error: "Invalid documentType" });
      return;
    }

    if (!text) {
      res.status(400).json({ error: "rawDocument.text is required" });
      return;
    }

    const mappingsDir = path.join(process.cwd(), "mappings");
    const mappingPath = path.join(mappingsDir, `${documentType}.json`);
    const relativeToMappings = path.relative(mappingsDir, mappingPath);

    if (relativeToMappings.startsWith("..") || path.isAbsolute(relativeToMappings)) {
      res.status(400).json({ error: "Invalid documentType" });
      return;
    }
    const mappingRaw = await fs.readFile(mappingPath, "utf8");
    const fieldsConfig = JSON.parse(mappingRaw);

    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const fields = fieldsConfig.map((field) => {
      const capture = captureFromLines(lines, field.label, field.hints);
      return {
        label: field.label,
        required: Boolean(field.required),
        value: capture?.value || "",
        source: capture?.matchedTerm || null
      };
    });

    const missingForLLM = useLLM ? fields.filter((field) => !field.value) : [];
    if (missingForLLM.length && useLLM) {
      const llmValues = await extractWithLLM(missingForLLM, text);
      fields.forEach((field) => {
        if (!field.value && typeof llmValues[field.label] === "string" && llmValues[field.label].trim()) {
          field.value = llmValues[field.label].trim();
          field.source = "llm";
        }
      });
    }

    const missingRequired = fields
      .filter((field) => field.required && !field.value)
      .map((field) => field.label);

    res.status(200).json({ fields, missingRequired });
  } catch (err) {
    console.error("/api/analyze error", err);
    res.status(500).json({ error: err.message || "Analysis failed" });
  }
}
