import { promises as fs } from "node:fs";
import path from "node:path";

import {
  FIELD_METRIC_HEADER,
  stringifyCsvRow,
} from "../../lib/telemetry/fieldMetrics.js";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "1mb",
    },
  },
};

const LOG_DIRECTORY = path.join(process.cwd(), "logs", "charter-wizard");
const LOG_FILENAME = "metrics.csv";
const LOG_PATH = path.join(LOG_DIRECTORY, LOG_FILENAME);
const MAX_LOG_BYTES = 5 * 1024 * 1024; // 5MB per log file

function headersMatch(header) {
  if (!Array.isArray(header) || header.length !== FIELD_METRIC_HEADER.length) {
    return false;
  }
  return FIELD_METRIC_HEADER.every((value, index) => header[index] === value);
}

function normalizeRow(row) {
  if (!Array.isArray(row) || row.length !== FIELD_METRIC_HEADER.length) {
    return null;
  }
  return row.map((value) => {
    if (value == null) {
      return "";
    }
    const stringValue = typeof value === "string" ? value : String(value);
    return stringValue.slice(0, 512);
  });
}

async function ensureLogDirectory() {
  await fs.mkdir(LOG_DIRECTORY, { recursive: true });
}

async function rotateLogFile() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const rotatedPath = path.join(LOG_DIRECTORY, `metrics-${timestamp}.csv`);
  try {
    await fs.rename(LOG_PATH, rotatedPath);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
}

async function prepareLogFile(payloadBytes) {
  await ensureLogDirectory();
  let needsHeader = false;
  try {
    const stats = await fs.stat(LOG_PATH);
    if (stats.size === 0) {
      needsHeader = true;
    }
    if (stats.size + payloadBytes > MAX_LOG_BYTES) {
      await rotateLogFile();
      needsHeader = true;
    }
  } catch (error) {
    if (error?.code === "ENOENT") {
      needsHeader = true;
    } else {
      throw error;
    }
  }
  return needsHeader;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  try {
    const { header, rows } = req.body ?? {};
    if (!headersMatch(header)) {
      return res.status(400).json({ ok: false, error: "Invalid telemetry header" });
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(204).end();
    }

    const normalizedRows = [];
    for (const row of rows) {
      const normalized = normalizeRow(row);
      if (!normalized) {
        return res.status(400).json({ ok: false, error: "Invalid telemetry row" });
      }
      normalizedRows.push(normalized);
    }

    const csvLines = normalizedRows.map((row) => stringifyCsvRow(row));
    const payload = csvLines.join("\n");
    const payloadWithNewline = payload ? `${payload}\n` : "";
    const payloadBytes = Buffer.byteLength(payloadWithNewline, "utf8");
    const needsHeader = await prepareLogFile(payloadBytes);

    const outputLines = [];
    if (needsHeader) {
      outputLines.push(stringifyCsvRow(FIELD_METRIC_HEADER));
    }
    outputLines.push(...csvLines);

    if (!outputLines.length) {
      return res.status(204).end();
    }

    const output = `${outputLines.join("\n")}\n`;
    await fs.appendFile(LOG_PATH, output, "utf8");

    return res.status(204).end();
  } catch (error) {
    console.error("conversation telemetry ingestion failed", error);
    return res.status(500).json({ ok: false, error: "Failed to persist telemetry" });
  }
}
