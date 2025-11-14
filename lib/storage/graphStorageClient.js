import { ConfidentialClientApplication } from "@azure/msal-node";
import { Buffer } from "node:buffer";

const GRAPH_SCOPE = ["https://graph.microsoft.com/.default"];
const DEFAULT_BASE_URL = "https://graph.microsoft.com/v1.0";
const SMALL_FILE_MAX_BYTES = 4 * 1024 * 1024; // 4 MB per Graph guidance
const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB chunks for large files

function assertConfig(value, name) {
  if (!value) {
    throw new Error(`Missing required Graph configuration value: ${name}`);
  }
  return value;
}

function normalizeFolderPath(folderPath) {
  if (!folderPath) {
    return "";
  }
  return folderPath
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join("/");
}

function encodePathSegments(path) {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function isResponseObject(value) {
  return value && typeof value === "object" && typeof value.arrayBuffer === "function";
}

export class GraphStorageClient {
  constructor({
    tenantId,
    clientId,
    clientSecret,
    driveId,
    siteId,
    baseUrl = DEFAULT_BASE_URL,
    defaultFolder,
    fetchImpl = fetch,
  }) {
    this.tenantId = assertConfig(tenantId, "tenantId");
    this.clientId = assertConfig(clientId, "clientId");
    this.clientSecret = assertConfig(clientSecret, "clientSecret");
    this.driveId = assertConfig(driveId, "driveId");
    this.siteId = siteId ?? null;
    this.baseUrl = baseUrl;
    this.defaultFolder = defaultFolder ?? "";
    this.fetch = fetchImpl;
    this.msalApp = new ConfidentialClientApplication({
      auth: {
        clientId: this.clientId,
        authority: `https://login.microsoftonline.com/${this.tenantId}`,
        clientSecret: this.clientSecret,
      },
    });
  }

  async getAccessToken() {
    const result = await this.msalApp.acquireTokenByClientCredential({
      scopes: GRAPH_SCOPE,
    });
    if (!result?.accessToken) {
      throw new Error("Failed to acquire Microsoft Graph access token");
    }
    return result.accessToken;
  }

  async graphFetch(path, { method = "GET", headers = {}, body } = {}) {
    const token = await this.getAccessToken();
    const computedHeaders = {
      Authorization: `Bearer ${token}`,
      ...headers,
    };
    if (body && !computedHeaders["Content-Type"]) {
      computedHeaders["Content-Type"] = "application/json";
    }
    const response = await this.fetch(`${this.baseUrl}${path}`, {
      method,
      headers: computedHeaders,
      body,
    });
    if (!response.ok) {
      const text = await response.text();
      const error = new Error(
        `Graph request failed: ${method} ${path} -> ${response.status}`
      );
      error.status = response.status;
      error.body = text;
      throw error;
    }
    if (response.status === 204) {
      return null;
    }
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return response.json();
    }
    return response;
  }

  resolveDriveContext({ driveId, siteId } = {}) {
    const contextDriveId = driveId ?? (siteId ? null : this.driveId);
    const contextSiteId = siteId ?? this.siteId ?? null;
    if (!contextDriveId && !contextSiteId) {
      throw new Error("driveId or siteId is required for Graph storage operations");
    }
    return { driveId: contextDriveId, siteId: contextSiteId };
  }

  buildDriveBasePath({ driveId, siteId }) {
    if (siteId) {
      return `/sites/${siteId}/drive`;
    }
    return `/drives/${driveId}`;
  }

  async getDriveItemByPath(path, options = {}) {
    const encoded = encodePathSegments(path);
    const context = this.resolveDriveContext(options);
    const base = this.buildDriveBasePath(context);
    try {
      return await this.graphFetch(`${base}/root:/${encoded}`, { method: "GET" });
    } catch (error) {
      if (error?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async getDriveItemById(itemId, options = {}) {
    const context = this.resolveDriveContext(options);
    const base = this.buildDriveBasePath(context);
    const selectParams = "$select=id,name,size,file,webUrl";
    try {
      return await this.graphFetch(`${base}/items/${itemId}?${selectParams}`, {
        method: "GET",
      });
    } catch (error) {
      if (error?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async fetchDriveItemContentById(itemId, options = {}) {
    const context = this.resolveDriveContext(options);
    const base = this.buildDriveBasePath(context);
    try {
      return await this.graphFetch(`${base}/items/${itemId}/content`, {
        method: "GET",
      });
    } catch (error) {
      if (error?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async fetchDriveItemContentByPath(path, options = {}) {
    const context = this.resolveDriveContext(options);
    const base = this.buildDriveBasePath(context);
    const encoded = encodePathSegments(path);
    try {
      return await this.graphFetch(`${base}/root:/${encoded}:/content`, {
        method: "GET",
      });
    } catch (error) {
      if (error?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async convertResponseToBuffer(response) {
    if (!response) {
      return { buffer: Buffer.alloc(0), contentType: "application/octet-stream" };
    }

    if (Buffer.isBuffer(response)) {
      return { buffer: response, contentType: "application/octet-stream" };
    }

    if (typeof response === "string") {
      return { buffer: Buffer.from(response, "utf8"), contentType: "text/plain" };
    }

    if (isResponseObject(response)) {
      const arrayBuffer = await response.arrayBuffer();
      const contentType =
        typeof response.headers?.get === "function"
          ? response.headers.get("content-type") || "application/octet-stream"
          : "application/octet-stream";
      return { buffer: Buffer.from(arrayBuffer), contentType };
    }

    throw new Error("Unsupported Graph download response type");
  }

  async downloadFileById({ id, driveId, siteId } = {}) {
    if (!id) {
      throw new Error("id is required to download a Graph drive item");
    }
    const context = this.resolveDriveContext({ driveId, siteId });
    const metadata = await this.getDriveItemById(id, context);
    if (!metadata) {
      return null;
    }
    const response = await this.fetchDriveItemContentById(id, context);
    const { buffer, contentType } = await this.convertResponseToBuffer(response);
    const mimeType =
      (metadata?.file && metadata.file.mimeType) || contentType || "application/octet-stream";
    return {
      id: metadata.id ?? id,
      name: metadata.name || metadata.id || id,
      size: metadata.size ?? buffer.length,
      mimeType,
      buffer,
      webUrl: metadata.webUrl ?? null,
      metadata,
    };
  }

  async downloadFileByPath({ path, driveId, siteId } = {}) {
    if (!path) {
      throw new Error("path is required to download a Graph drive item");
    }
    const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
    const context = this.resolveDriveContext({ driveId, siteId });
    const metadata = await this.getDriveItemByPath(normalizedPath, context);
    if (!metadata?.id) {
      return null;
    }
    const response = await this.fetchDriveItemContentByPath(normalizedPath, context);
    const { buffer, contentType } = await this.convertResponseToBuffer(response);
    const mimeType =
      (metadata?.file && metadata.file.mimeType) || contentType || "application/octet-stream";
    return {
      id: metadata.id,
      name: metadata.name || metadata.id,
      size: metadata.size ?? buffer.length,
      mimeType,
      buffer,
      webUrl: metadata.webUrl ?? null,
      metadata,
    };
  }

  async createFolder(parentId, name) {
    const payload = {
      name,
      folder: {},
      "@microsoft.graph.conflictBehavior": "replace",
    };
    const path = parentId
      ? `/drives/${this.driveId}/items/${parentId}/children`
      : `/drives/${this.driveId}/root/children`;
    return this.graphFetch(path, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async ensureFolder(folderPath) {
    const normalized = normalizeFolderPath(folderPath || this.defaultFolder);
    if (!normalized) {
      return { id: null, path: "" };
    }

    const segments = normalized.split("/");
    let parentId = null;
    let currentPath = "";

    for (const segment of segments) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      const existing = await this.getDriveItemByPath(currentPath);
      if (existing?.id) {
        parentId = existing.id;
        continue;
      }
      const created = await this.createFolder(parentId, segment);
      parentId = created?.id ?? parentId;
    }

    return { id: parentId, path: normalized };
  }

  buildUploadPath(folderPath, filename) {
    const normalizedFolder = normalizeFolderPath(folderPath || this.defaultFolder);
    const path = normalizedFolder ? `${normalizedFolder}/${filename}` : filename;
    return encodePathSegments(path);
  }

  async uploadBuffer({ buffer, filename, folderPath }) {
    if (!Buffer.isBuffer(buffer)) {
      throw new Error("buffer must be a Node.js Buffer");
    }
    if (!filename) {
      throw new Error("filename is required");
    }
    await this.ensureFolder(folderPath);
    const encodedPath = this.buildUploadPath(folderPath, filename);
    if (buffer.length <= SMALL_FILE_MAX_BYTES) {
      return this.uploadSmallFile(encodedPath, buffer);
    }
    return this.uploadLargeFile(encodedPath, buffer);
  }

  async uploadSmallFile(encodedPath, buffer) {
    const response = await this.graphFetch(
      `/drives/${this.driveId}/root:/${encodedPath}:/content`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/octet-stream",
        },
        body: buffer,
      }
    );
    return this.normalizeUploadResponse(response);
  }

  async uploadLargeFile(encodedPath, buffer) {
    const session = await this.graphFetch(
      `/drives/${this.driveId}/root:/${encodedPath}:/createUploadSession`,
      {
        method: "POST",
        body: JSON.stringify({}),
      }
    );

    const uploadUrl = session?.uploadUrl;
    if (!uploadUrl) {
      throw new Error("Failed to create Graph upload session");
    }

    let start = 0;
    const total = buffer.length;
    while (start < total) {
      const end = Math.min(start + DEFAULT_CHUNK_SIZE, total);
      const chunk = buffer.subarray(start, end);
      const response = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Length": `${chunk.length}`,
          "Content-Range": `bytes ${start}-${end - 1}/${total}`,
        },
        body: chunk,
      });
      if (!response.ok && response.status !== 202) {
        const text = await response.text();
        const error = new Error(
          `Graph chunk upload failed with status ${response.status}`
        );
        error.body = text;
        throw error;
      }
      if (response.status === 201 || response.status === 200) {
        const result = await response.json();
        return this.normalizeUploadResponse(result);
      }
      start = end;
    }

    throw new Error("Graph upload session did not return a completed item");
  }

  normalizeUploadResponse(response) {
    if (!response) {
      throw new Error("Invalid Graph upload response");
    }
    return {
      id: response.id,
      webUrl: response.webUrl,
      eTag: response.eTag || response.etag,
      size: response.size,
      platform: "graph",
      driveId: this.driveId,
    };
  }

  async setListItemFields(uploadResult, fields) {
    if (!uploadResult?.id || !fields || Object.keys(fields).length === 0) {
      return;
    }
    await this.graphFetch(
      `/drives/${this.driveId}/items/${uploadResult.id}/listItem/fields`,
      {
        method: "PATCH",
        body: JSON.stringify(fields),
      }
    );
  }
}

export default GraphStorageClient;
