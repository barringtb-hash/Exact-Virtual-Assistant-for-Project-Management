import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

const MIME_BY_EXTENSION = new Map([
  [".pdf", "application/pdf"],
  [".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  [".txt", "text/plain"],
  [".json", "application/json"],
]);

function sanitizeFolderPath(folderPath) {
  if (!folderPath) {
    return "";
  }
  const segments = folderPath
    .split(/[\\/]+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  for (const segment of segments) {
    if (segment === "." || segment === "..") {
      throw new Error("folderPath cannot include relative path segments");
    }
  }

  return segments.join(path.sep);
}

function buildMetadataPath(filePath) {
  return `${filePath}.metadata.json`;
}

function resolveMimeType(filename) {
  const extension = path.extname(filename || "").toLowerCase();
  return MIME_BY_EXTENSION.get(extension) || "application/octet-stream";
}

export class LocalStorageClient {
  constructor({ baseDirectory } = {}) {
    this.baseDirectory = baseDirectory
      ? path.resolve(baseDirectory)
      : path.resolve(process.cwd(), "tmp", "storage");
  }

  resolveAbsolutePath(relativePath) {
    if (!relativePath || typeof relativePath !== "string") {
      throw new Error("path is required to read from local storage");
    }
    const trimmed = relativePath.trim();
    if (!trimmed) {
      throw new Error("path is required to read from local storage");
    }
    const normalized = trimmed.replace(/^[/\\]+/, "");
    const absolutePath = path.resolve(this.baseDirectory, normalized);
    const relative = path.relative(this.baseDirectory, absolutePath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("path resolves outside the storage directory");
    }
    return absolutePath;
  }

  async ensureFolder(folderPath) {
    const sanitized = sanitizeFolderPath(folderPath);
    const absolutePath = sanitized
      ? path.resolve(this.baseDirectory, sanitized)
      : this.baseDirectory;
    const relative = path.relative(this.baseDirectory, absolutePath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("folderPath resolves outside the storage directory");
    }
    await fs.mkdir(absolutePath, { recursive: true });
    return {
      id: absolutePath,
      absolutePath,
      path: sanitized,
    };
  }

  async uploadBuffer({ buffer, filename, folderPath, metadata }) {
    if (!buffer || !Buffer.isBuffer(buffer)) {
      throw new Error("buffer is required for upload");
    }
    if (!filename) {
      throw new Error("filename is required for upload");
    }
    const folder = await this.ensureFolder(folderPath);
    const targetPath = path.join(folder.absolutePath, filename);
    await fs.writeFile(targetPath, buffer);
    if (metadata && Object.keys(metadata).length > 0) {
      await fs.writeFile(
        buildMetadataPath(targetPath),
        JSON.stringify(metadata, null, 2),
        "utf8"
      );
    }
    return {
      id: crypto.randomUUID(),
      webUrl: `file://${targetPath}`,
      eTag: `W/\"${Date.now()}\"`,
      path: targetPath,
      size: buffer.length,
      platform: "local",
    };
  }

  async setListItemFields(uploadResult, fields) {
    if (!uploadResult?.path) {
      return;
    }
    const metadataPath = buildMetadataPath(uploadResult.path);
    const serialized = JSON.stringify(
      { fields, updatedAt: new Date().toISOString() },
      null,
      2
    );
    await fs.writeFile(metadataPath, serialized, "utf8");
  }

  async downloadFileByPath({ path: relativePath } = {}) {
    const absolutePath = this.resolveAbsolutePath(relativePath);
    const buffer = await fs.readFile(absolutePath);
    const name = path.basename(absolutePath);
    return {
      id: absolutePath,
      name,
      mimeType: resolveMimeType(name),
      size: buffer.length,
      buffer,
      path: absolutePath,
    };
  }

  async downloadFileById({ id } = {}) {
    if (!id) {
      throw new Error("id is required to download from local storage");
    }
    return this.downloadFileByPath({ path: id });
  }
}

export default LocalStorageClient;
