/**
 * MCP Client Singleton
 *
 * Provides a singleton instance of the MCP client manager that is
 * initialized lazily and shared across the application.
 */

import { MCPClientManager, type MCPServerConfig } from "./MCPClientManager.js";

let mcpManager: MCPClientManager | null = null;
let initPromise: Promise<MCPClientManager> | null = null;

/**
 * Default MCP configuration
 *
 * Returns server configs with their enabled status and required environment variables.
 */
export function getMCPConfig(): MCPServerConfig[] {
  const configs: MCPServerConfig[] = [];

  // Internal Exact VA server (always available when MCP is enabled)
  configs.push({
    name: "exact-va",
    command: "node",
    args: ["--experimental-strip-types", "mcp-servers/exact-va/index.ts"],
    enabled: process.env.MCP_ENABLED !== "false",
    requiredEnv: [],
  });

  // Smartsheet integration
  const hasSmartsheetKey = Boolean(process.env.SMARTSHEET_API_KEY?.trim());
  configs.push({
    name: "smartsheet",
    command: "node",
    args: ["--experimental-strip-types", "mcp-servers/smartsheet/index.ts"],
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
    args: ["--experimental-strip-types", "mcp-servers/office365/index.ts"],
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
