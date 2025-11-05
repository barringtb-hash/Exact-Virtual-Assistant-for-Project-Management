import GraphStorageClient from "./graphStorageClient.js";
import LocalStorageClient from "./localStorageClient.js";

function readEnv(key) {
  if (typeof process !== "undefined" && process?.env) {
    return process.env[key];
  }
  return undefined;
}

function coalesce(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  return undefined;
}

function buildGraphConfig(overrides = {}) {
  const tenantId = coalesce(overrides.tenantId, readEnv("MS_TENANT_ID"));
  const clientId = coalesce(overrides.clientId, readEnv("MS_CLIENT_ID"));
  const clientSecret = coalesce(overrides.clientSecret, readEnv("MS_CLIENT_SECRET"));
  const driveId = coalesce(overrides.driveId, readEnv("MS_DRIVE_ID"));
  const siteId = coalesce(overrides.siteId, readEnv("MS_SITE_ID"));
  const defaultFolder = coalesce(
    overrides.defaultFolder,
    readEnv("MS_FOLDER_PATH"),
    ""
  );

  if (tenantId && clientId && clientSecret && driveId) {
    return {
      tenantId,
      clientId,
      clientSecret,
      driveId,
      siteId,
      defaultFolder,
    };
  }
  return null;
}

export function createStorageClientFromEnv(overrides = {}) {
  const platform = (overrides.platform || readEnv("CHARTER_STORAGE_PLATFORM") || "graph")
    .toLowerCase()
    .trim();

  if (["graph", "sharepoint", "onedrive"].includes(platform)) {
    const graphConfig = buildGraphConfig(overrides);
    if (graphConfig) {
      return new GraphStorageClient(graphConfig);
    }
    console.warn(
      "Graph storage platform requested but Microsoft 365 credentials are missing. Falling back to local storage client."
    );
  }

  return new LocalStorageClient({ baseDirectory: overrides.baseDirectory });
}

export { GraphStorageClient, LocalStorageClient };
