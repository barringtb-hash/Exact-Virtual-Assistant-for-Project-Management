import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import Busboy from "busboy";

const ALLOWED_EXTENSIONS = new Set(["docx", "pdf", "pptx", "txt", "xlsx", "csv"]);

function normalizeBody(req) {
  if (!req.body || typeof req.body !== "string") {
    return req.body;
  }
  try {
    return JSON.parse(req.body);
  } catch (err) {
    return {};
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  try {
    normalizeBody(req); // ensures body is consumed for other middlewares
    const uploadResult = await new Promise((resolve, reject) => {
      const busboy = Busboy({
        headers: req.headers,
        limits: {
          files: 1,
          fileSize: 25 * 1024 * 1024
        }
      });

      let fileBufferChunks = [];
      let fileInfo = null;
      let totalBytes = 0;
      let fileRejected = false;

      busboy.on("file", (fieldname, file, info) => {
        if (fileRejected) {
          file.resume();
          return;
        }
        const { filename, mimeType } = info;
        const extension = path.extname(filename || "").replace(/^\./, "").toLowerCase();

        if (!ALLOWED_EXTENSIONS.has(extension)) {
          fileRejected = true;
          file.resume();
          reject(
            new Error(
              `Unsupported file type: ${extension || "unknown"}. Allowed types are ${Array.from(ALLOWED_EXTENSIONS).join(", ")}`
            )
          );
          return;
        }

        fileInfo = {
          originalName: filename,
          mimeType,
          extension
        };

        file.on("data", (data) => {
          totalBytes += data.length;
          fileBufferChunks.push(data);
        });

        file.on("limit", () => {
          fileRejected = true;
          file.resume();
          reject(new Error("File size limit exceeded"));
        });
      });

      busboy.on("error", (err) => {
        reject(err);
      });

      busboy.on("finish", () => {
        if (fileRejected) {
          return;
        }
        if (!fileInfo) {
          reject(new Error("No file uploaded"));
          return;
        }

        const buffer = Buffer.concat(fileBufferChunks);
        const fileId = randomUUID();
        const tmpDir = os.tmpdir();
        const storedName = `${fileId}.${fileInfo.extension}`;
        const filePath = path.join(tmpDir, storedName);
        const metadataPath = path.join(tmpDir, `${fileId}.meta.json`);
        const metadata = {
          ...fileInfo,
          size: totalBytes,
          fileId,
          storedName
        };

        (async () => {
          try {
            await fs.writeFile(filePath, buffer);
            await fs.writeFile(metadataPath, JSON.stringify(metadata));
            resolve({ fileId, metadata });
          } catch (writeErr) {
            reject(writeErr);
          }
        })();
      });

      req.pipe(busboy);
    });

    res.status(200).json(uploadResult);
  } catch (err) {
    console.error("/api/upload error", err);
    res.status(500).json({ error: err.message || "Upload failed" });
  }
}

export const config = {
  api: {
    bodyParser: false
  }
};
