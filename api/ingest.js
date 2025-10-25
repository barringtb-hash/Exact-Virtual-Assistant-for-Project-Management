import formidable from "formidable";
import path from "path";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { Writable } from "stream";

const ALLOWED_EXTENSIONS = new Set(["docx", "pdf", "pptx", "txt", "xlsx", "csv"]);

function mapMimeToExtension(mimeType = "") {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes("pdf")) return "pdf";
  if (normalized.includes("word") || normalized.includes("officedocument.wordprocessingml")) return "docx";
  if (normalized.includes("presentation") || normalized.includes("officedocument.presentationml")) return "pptx";
  if (normalized.includes("sheet") || normalized.includes("spreadsheetml")) return "xlsx";
  if (normalized.includes("csv")) return "csv";
  if (normalized.startsWith("text")) return "txt";
  return "";
}

function parsePptx(buffer) {
  return JSZip.loadAsync(buffer).then(async (zip) => {
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
  });
}

function parseSpreadsheet(buffer) {
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

function createMemoryStream(file) {
  const chunks = [];
  return new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    },
    final(callback) {
      file.buffer = Buffer.concat(chunks);
      file.size = file.buffer.length;
      callback();
    }
  });
}

async function parseBufferByExtension(buffer, extension) {
  const rawDocument = { text: "" };
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
      if (result.sections?.length) {
        rawDocument.sections = result.sections;
      }
      break;
    }
    case "txt": {
      rawDocument.text = buffer.toString("utf8");
      break;
    }
    case "xlsx":
    case "csv": {
      const result = parseSpreadsheet(buffer);
      rawDocument.text = result.text;
      if (result.tables?.length) {
        rawDocument.tables = result.tables;
      }
      break;
    }
    default: {
      throw new Error(`Unsupported file extension: ${extension}`);
    }
  }
  return rawDocument;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  try {
    const form = formidable({
      maxFileSize: 25 * 1024 * 1024,
      multiples: false,
      allowEmptyFiles: false,
      fileWriteStreamHandler: (file) => createMemoryStream(file)
    });

    const { files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) {
          reject(err);
        } else {
          resolve({ fields, files });
        }
      });
    });

    const uploadedFile = files?.file || (files ? Object.values(files)[0] : null);
    if (!uploadedFile) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const buffer = uploadedFile.buffer;
    if (!buffer || !Buffer.isBuffer(buffer) || !buffer.length) {
      res.status(400).json({ error: "Uploaded file is empty" });
      return;
    }

    const originalName = uploadedFile.originalFilename || uploadedFile.newFilename || "uploaded-file";
    const mimeType = uploadedFile.mimetype || "";
    const extension = (
      path.extname(originalName || "").replace(/^\./, "") || mapMimeToExtension(mimeType)
    ).toLowerCase();

    if (!ALLOWED_EXTENSIONS.has(extension)) {
      res.status(400).json({
        error: `Unsupported file type: ${extension || "unknown"}. Allowed types are ${Array.from(ALLOWED_EXTENSIONS).join(", ")}`
      });
      return;
    }

    const rawDocument = await parseBufferByExtension(buffer, extension);
    const metadata = {
      originalName,
      size: typeof uploadedFile.size === "number" ? uploadedFile.size : buffer.length,
      mimeType,
      extension
    };

    res.status(200).json({ ok: true, rawDocument, metadata });
  } catch (err) {
    console.error("/api/ingest error", err);
    res.status(500).json({ error: err.message || "Ingestion failed" });
  }
}

export const config = {
  api: {
    bodyParser: false
  }
};
