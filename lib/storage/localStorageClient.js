import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

function sanitizeFolderPath(folderPath) {
  if (!folderPath) {
    return "";
  }
  return folderPath
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join(path.sep);
}

function buildMetadataPath(filePath) {
  return `${filePath}.metadata.json`;
}

export class LocalStorageClient {
  constructor({ baseDirectory } = {}) {
    this.baseDirectory = baseDirectory
      ? path.resolve(baseDirectory)
      : path.resolve(process.cwd(), "tmp", "storage");
  }

  async ensureFolder(folderPath) {
    const sanitized = sanitizeFolderPath(folderPath);
    const absolutePath = sanitized
      ? path.join(this.baseDirectory, sanitized)
      : this.baseDirectory;
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
}

export default LocalStorageClient;
