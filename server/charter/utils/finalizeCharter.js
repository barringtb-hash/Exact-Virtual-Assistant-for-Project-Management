import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

import {
  appendCharterDocumentRecord,
  readCharterDocumentRecords,
} from "./documentStore.js";
import {
  assembleCharterDocxBuffer,
  assembleCharterPdfBuffer,
} from "./documentAssembler.js";
import { computeNextVersion } from "./versioning.js";
import { createStorageClientFromEnv } from "../../../lib/storage/index.js";

const TMP_OUTPUT_DIR = path.resolve(process.cwd(), "tmp", "charter-finalization");

function sanitizeSegment(value, fallback = "document") {
  const normalized = (value ?? "")
    .toString()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\-_. ]+/gu, "")
    .trim()
    .replace(/\s+/g, "_");
  return normalized || fallback;
}

function compactObject(object) {
  if (!object || typeof object !== "object") {
    return {};
  }
  const result = {};
  for (const [key, value] of Object.entries(object)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    result[key] = value;
  }
  return result;
}

async function ensureTmpDirectory() {
  await fs.mkdir(TMP_OUTPUT_DIR, { recursive: true });
}

async function writeTempFile(filename, buffer) {
  await ensureTmpDirectory();
  const filePath = path.join(TMP_OUTPUT_DIR, filename);
  await fs.writeFile(filePath, buffer);
  return filePath;
}

function buildFilename({ projectKey, projectName, version, date, extension }) {
  const safeKey = sanitizeSegment(projectKey, "Project");
  const safeName = sanitizeSegment(projectName, "Charter");
  const safeVersion = sanitizeSegment(version, "v1_0_0");
  const stamp = date.replace(/-/g, "");
  return `Charter_${safeKey}_${safeName}_v${safeVersion}_${stamp}.${extension}`;
}

function resolveMetadataFields(metadata, version, fileType) {
  const tags = Array.isArray(metadata?.tags)
    ? metadata.tags
        .map((tag) => tag?.trim())
        .filter(Boolean)
        .join("; ")
    : undefined;
  return compactObject({
    ProjectID: metadata?.projectId ?? metadata?.projectKey,
    ProjectName: metadata?.projectName,
    OwnerUPN: metadata?.ownerUpn ?? metadata?.owner,
    Version: version,
    Status: metadata?.status ?? (metadata?.isFinal ? "Final" : undefined),
    BusinessUnit: metadata?.businessUnit,
    Tags: tags,
    DocumentType: fileType.toUpperCase(),
  });
}

async function uploadArtifact({
  buffer,
  filename,
  storageClient,
  folderPath,
  metadata,
  version,
  fileType,
}) {
  const uploadResult = await storageClient.uploadBuffer({
    buffer,
    filename,
    folderPath,
  });

  const listItemFields = resolveMetadataFields(metadata, version, fileType);
  if (Object.keys(listItemFields).length > 0) {
    await storageClient.setListItemFields(uploadResult, listItemFields);
  }

  return {
    ...uploadResult,
    filename,
  };
}

export async function finalizeCharter({
  charterId,
  charter,
  exportOptions = { docx: true, pdf: true },
  storageOptions = {},
  metadata = {},
  version: requestedVersion,
  createdBy,
}) {
  if (!charterId) {
    throw new Error("charterId is required to finalize a charter");
  }
  if (!charter || typeof charter !== "object") {
    throw new Error("charter payload is required to finalize");
  }

  const existingRecords = await readCharterDocumentRecords(charterId);
  const version = computeNextVersion(existingRecords, requestedVersion);
  const now = new Date();
  const dateStamp = now.toISOString().slice(0, 10);

  const projectKey = metadata?.projectKey ?? charter?.project_key ?? charterId;
  const projectName = metadata?.projectName ?? charter?.project_name ?? charterId;

  const results = [];
  const storageClient = createStorageClientFromEnv(storageOptions);

  if (exportOptions?.docx) {
    const docxBuffer = await assembleCharterDocxBuffer(charter);
    const docxFilename = buildFilename({
      projectKey,
      projectName,
      version,
      date: dateStamp,
      extension: "docx",
    });
    const tempFile = await writeTempFile(docxFilename, docxBuffer);
    const upload = await uploadArtifact({
      buffer: docxBuffer,
      filename: docxFilename,
      storageClient,
      folderPath: storageOptions.folderPath,
      metadata,
      version,
      fileType: "docx",
    });
    const record = {
      id: crypto.randomUUID(),
      charterId,
      type: "docx",
      version,
      filename: docxFilename,
      driveItemId: upload.id,
      eTag: upload.eTag,
      webUrl: upload.webUrl,
      size: upload.size,
      platform: upload.platform,
      storage: {
        folderPath: storageOptions.folderPath ?? null,
        driveId: upload.driveId ?? storageOptions.driveId ?? null,
      },
      metadata: {
        ...metadata,
        tempFile,
      },
      createdBy: createdBy ?? metadata?.owner ?? null,
      createdAt: now.toISOString(),
    };
    await appendCharterDocumentRecord(charterId, record);
    results.push(record);
  }

  if (exportOptions?.pdf) {
    const pdfBuffer = await assembleCharterPdfBuffer(charter);
    const pdfFilename = buildFilename({
      projectKey,
      projectName,
      version,
      date: dateStamp,
      extension: "pdf",
    });
    const tempFile = await writeTempFile(pdfFilename, pdfBuffer);
    const upload = await uploadArtifact({
      buffer: pdfBuffer,
      filename: pdfFilename,
      storageClient,
      folderPath: storageOptions.folderPath,
      metadata,
      version,
      fileType: "pdf",
    });
    const record = {
      id: crypto.randomUUID(),
      charterId,
      type: "pdf",
      version,
      filename: pdfFilename,
      driveItemId: upload.id,
      eTag: upload.eTag,
      webUrl: upload.webUrl,
      size: upload.size,
      platform: upload.platform,
      storage: {
        folderPath: storageOptions.folderPath ?? null,
        driveId: upload.driveId ?? storageOptions.driveId ?? null,
      },
      metadata: {
        ...metadata,
        tempFile,
      },
      createdBy: createdBy ?? metadata?.owner ?? null,
      createdAt: now.toISOString(),
    };
    await appendCharterDocumentRecord(charterId, record);
    results.push(record);
  }

  return {
    charterId,
    version,
    documents: results,
  };
}

export default finalizeCharter;
