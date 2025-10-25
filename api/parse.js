import { promises as fs } from "fs";
import os from "os";
import path from "path";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import JSZip from "jszip";
import * as XLSX from "xlsx";

function parseRequestBody(req) {
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

async function parsePptx(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files)
    .filter((name) => name.startsWith("ppt/slides/slide") && name.endsWith(".xml"))
    .sort();

  const sections = [];
  for (const slideName of slideFiles) {
    const xml = await zip.file(slideName).async("string");
    const matches = Array.from(xml.matchAll(/<a:t>(.*?)<\/a:t>/g));
    const slideText = matches
      .map((match) => match[1])
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    sections.push({
      title: `Slide ${sections.length + 1}`,
      text: slideText
    });
  }
  const text = sections.map((section) => section.text).filter(Boolean).join("\n\n");
  return { text, sections };
}

async function parseSpreadsheet(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const tables = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const table = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });
    const [headerRow = [], ...rows] = table;
    return {
      name,
      header: headerRow,
      rows
    };
  });
  const text = tables
    .map((table) => {
      const rows = table.rows.map((row) => row.join(" \u2022 ")).join("\n");
      return `${table.name}\n${rows}`.trim();
    })
    .filter(Boolean)
    .join("\n\n");
  return { text, tables };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  let filePath;
  let metadataPath;

  try {
    const body = parseRequestBody(req);
    const fileId = body?.fileId;

    if (!fileId) {
      res.status(400).json({ error: "fileId is required" });
      return;
    }

    const tmpDir = os.tmpdir();
    metadataPath = path.join(tmpDir, `${fileId}.meta.json`);

    const metadataRaw = await fs.readFile(metadataPath, "utf8").catch(() => null);
    if (!metadataRaw) {
      res.status(404).json({ error: "Metadata not found" });
      return;
    }

    const metadata = JSON.parse(metadataRaw);

    filePath = path.join(tmpDir, metadata.storedName || `${fileId}.${metadata.extension}`);

    const buffer = await fs.readFile(filePath).catch(() => null);
    if (!buffer) {
      res.status(404).json({ error: "Stored file not found" });
      return;
    }
    const extension = (metadata.extension || path.extname(filePath).replace(/^\./, "")).toLowerCase();

    let rawDocument = { text: "", sections: [], tables: [] };

    switch (extension) {
      case "pdf": {
        const parsed = await pdfParse(buffer);
        rawDocument.text = parsed.text || "";
        break;
      }
      case "docx": {
        const { value } = await mammoth.extractRawText({ buffer });
        rawDocument.text = value || "";
        break;
      }
      case "pptx": {
        const result = await parsePptx(buffer);
        rawDocument.text = result.text;
        rawDocument.sections = result.sections;
        break;
      }
      case "txt": {
        rawDocument.text = buffer.toString("utf8");
        break;
      }
      case "xlsx":
      case "csv": {
        const result = await parseSpreadsheet(buffer);
        rawDocument.text = result.text;
        rawDocument.tables = result.tables;
        break;
      }
      default: {
        res.status(400).json({ error: `Unsupported file extension: ${extension}` });
        return;
      }
    }

    if (!rawDocument.sections?.length) {
      delete rawDocument.sections;
    }
    if (!rawDocument.tables?.length) {
      delete rawDocument.tables;
    }

    res.status(200).json({ rawDocument, metadata });
  } catch (err) {
    console.error("/api/parse error", err);
    res.status(500).json({ error: err.message || "Parsing failed" });
  } finally {
    if (filePath) {
      try {
        await fs.unlink(filePath);
      } catch (cleanupErr) {
        console.warn("Failed to remove temp file", cleanupErr);
      }
    }
    if (metadataPath) {
      try {
        await fs.unlink(metadataPath);
      } catch (cleanupErr) {
        console.warn("Failed to remove metadata file", cleanupErr);
      }
    }
  }
}
