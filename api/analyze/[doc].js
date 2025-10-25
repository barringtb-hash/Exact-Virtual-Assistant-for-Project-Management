import charter from "../../mappings/charter.json" assert { type: "json" };
import ddp from "../../mappings/ddp.json" assert { type: "json" };
import raid from "../../mappings/raid.json" assert { type: "json" };

const MAPS = {
  charter,
  ddp,
  raid
};

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

export default function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method Not Allowed" });
    return;
  }

  try {
    const body = parseBody(req);
    const { rawDocument } = body || {};
    const text = rawDocument?.text || "";
    const doc = req.query?.doc || req.params?.doc;

    if (!doc) {
      res.status(400).json({ ok: false, error: "doc is required" });
      return;
    }

    if (typeof doc !== "string" || !/^[\w-]+$/.test(doc)) {
      res.status(400).json({ ok: false, error: "Invalid doc" });
      return;
    }

    const fieldsConfig = MAPS[doc];
    if (!Array.isArray(fieldsConfig)) {
      res.status(404).json({ ok: false, error: "Unknown doc" });
      return;
    }

    if (!text) {
      res.status(400).json({ ok: false, error: "rawDocument.text is required" });
      return;
    }

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

    const missingRequired = fields
      .filter((field) => field.required && !field.value)
      .map((field) => field.label);

    res.status(200).json({ ok: true, fields, missingRequired });
  } catch (err) {
    console.error("/api/analyze error", err);
    res.status(500).json({ ok: false, error: err.message || "Analysis failed" });
  }
}
