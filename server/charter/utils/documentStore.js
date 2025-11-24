import fs from "fs/promises";
import path from "path";

const BASE_DIRECTORY = path.resolve(process.cwd(), "tmp", "charter-documents");

function normalizeCharterId(charterId) {
  if (!charterId || typeof charterId !== "string") {
    throw new Error("charterId is required");
  }
  const trimmed = charterId.trim();
  if (!trimmed) {
    throw new Error("charterId must not be blank");
  }
  return trimmed;
}

function buildFilePath(charterId) {
  return path.join(BASE_DIRECTORY, `${normalizeCharterId(charterId)}.json`);
}

async function ensureBaseDirectory() {
  await fs.mkdir(BASE_DIRECTORY, { recursive: true });
}

export async function readCharterDocumentRecords(charterId) {
  const filePath = buildFilePath(charterId);
  try {
    const contents = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(contents);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [];
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export async function writeCharterDocumentRecords(charterId, records) {
  await ensureBaseDirectory();
  const filePath = buildFilePath(charterId);
  const serialized = JSON.stringify(records, null, 2);
  await fs.writeFile(filePath, serialized, "utf8");
  return records;
}

export async function appendCharterDocumentRecord(charterId, record) {
  const existing = await readCharterDocumentRecords(charterId);
  const nextRecords = [...existing, record];
  await writeCharterDocumentRecords(charterId, nextRecords);
  return record;
}
