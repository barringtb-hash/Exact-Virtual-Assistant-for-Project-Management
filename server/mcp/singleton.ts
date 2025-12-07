/**
 * MCP Client Singleton
 *
 * Provides a singleton instance of the MCP client manager that is
 * initialized lazily and shared across the application.
 */

import { MCPClientManager, type MCPServerConfig } from "./MCPClientManager.js";
import { existsSync } from "fs";
import { resolve } from "path";

let mcpManager: MCPClientManager | null = null;
let initPromise: Promise<MCPClientManager> | null = null;

/**
 * Determine whether to use compiled JS files or TypeScript sources
 *
 * In production (Vercel), we use pre-compiled JS files from dist/.
 * In development, we can use TypeScript files with --experimental-strip-types.
 */
function getMCPServerPath(serverName: string): string[] {
  // Check if running in production/Vercel environment
  const isProduction = process.env.VERCEL === "1" || process.env.NODE_ENV === "production";

  // Check if compiled files exist (dist/mcp-servers/...)
  const compiledPath = `dist/mcp-servers/${serverName}/index.js`;
  const hasCompiledFiles = existsSync(resolve(process.cwd(), compiledPath));

  if (isProduction || hasCompiledFiles) {
    // Use compiled JavaScript files
    return [compiledPath];
  } else {
    // Use TypeScript files directly with experimental strip-types
    return ["--experimental-strip-types", `mcp-servers/${serverName}/index.ts`];
  }
}

/**
 * Default MCP configuration
 *
 * Returns server configs with their enabled status and required environment variables.
 */
export function getMCPConfig(): MCPServerConfig[] {
  const configs: MCPServerConfig[] = [];

  // Internal Exact VA server
  // Note: In production/Vercel, the exact-va server is disabled because it has
  // complex dependencies on the full server codebase that don't bundle well.
  // The exact-va tools are available through direct API calls instead.
  const isProduction = process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
  configs.push({
    name: "exact-va",
    command: "node",
    args: getMCPServerPath("exact-va"),
    enabled: process.env.MCP_EXACT_VA_ENABLED === "true" || (!isProduction && process.env.MCP_ENABLED !== "false"),
    requiredEnv: [],
  });

  // Smartsheet integration
  const hasSmartsheetKey = Boolean(process.env.SMARTSHEET_API_KEY?.trim());
  configs.push({
    name: "smartsheet",
    command: "node",
    args: getMCPServerPath("smartsheet"),
    env: {
      SMARTSHEET_API_KEY: process.env.SMARTSHEET_API_KEY || "",
    },
    enabled: hasSmartsheetKey && process.env.MCP_SMARTSHEET_ENABLED !== "false",
    requiredEnv: ["SMARTSHEET_API_KEY"],
  });

  // Office 365 integration
  const hasAzureConfig =
    Boolean(process.env.AZURE_CLIENT_ID?.trim()) &&
    Boolean(process.env.AZURE_TENANT_ID?.trim());
  configs.push({
    name: "office365",
    command: "node",
    args: getMCPServerPath("office365"),
    env: {
      AZURE_CLIENT_ID: process.env.AZURE_CLIENT_ID || "",
      AZURE_CLIENT_SECRET: process.env.AZURE_CLIENT_SECRET || "",
      AZURE_TENANT_ID: process.env.AZURE_TENANT_ID || "",
    },
    enabled: hasAzureConfig && process.env.MCP_OFFICE365_ENABLED !== "false",
    requiredEnv: ["AZURE_CLIENT_ID", "AZURE_CLIENT_SECRET", "AZURE_TENANT_ID"],
  });

  return configs;
}

/**
 * Get or create the MCP client manager singleton
 *
 * This function is idempotent and thread-safe - multiple calls will
 * return the same initialized instance.
 */
export async function getOrCreateMCPManager(): Promise<MCPClientManager> {
  // Return existing manager if already initialized
  if (mcpManager) {
    return mcpManager;
  }

  // Wait for existing initialization if in progress
  if (initPromise) {
    return initPromise;
  }

  // Start initialization
  initPromise = (async () => {
    const configs = getMCPConfig();
    const manager = new MCPClientManager(configs);

    try {
      await manager.initialize();
      mcpManager = manager;
      return manager;
    } catch (error) {
      console.error("Failed to initialize MCP manager:", error);
      // Still return the manager - some servers may have connected
      mcpManager = manager;
      return manager;
    }
  })();

  return initPromise;
}

/**
 * Check if MCP is enabled
 */
export function isMCPEnabled(): boolean {
  return process.env.MCP_ENABLED !== "false";
}

/**
 * Get the current MCP manager without initializing
 *
 * Returns null if not yet initialized.
 */
export function getMCPManager(): MCPClientManager | null {
  return mcpManager;
}

/**
 * Reset the singleton (for testing)
 */
export async function resetMCPManager(): Promise<void> {
  if (mcpManager) {
    await mcpManager.disconnectAll();
    mcpManager = null;
  }
  initPromise = null;
}

export default {
  getOrCreateMCPManager,
  getMCPManager,
  getMCPConfig,
  isMCPEnabled,
  resetMCPManager,
};
