/**
 * MCP Client Manager
 *
 * Manages connections to multiple MCP servers and provides a unified interface
 * for tool discovery and invocation.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Tool, Resource } from "@modelcontextprotocol/sdk/types.js";

/**
 * Configuration for an MCP server
 */
export interface MCPServerConfig {
  /** Unique name for this server */
  name: string;
  /** Command to run (e.g., "node") */
  command: string;
  /** Arguments to pass to the command */
  args: string[];
  /** Environment variables to set */
  env?: Record<string, string>;
  /** Whether this server is enabled */
  enabled?: boolean;
  /** Environment variables required for this server to work */
  requiredEnv?: string[];
}

/**
 * Extended tool with server information
 */
export interface MCPTool extends Tool {
  /** The server that provides this tool */
  serverName: string;
}

/**
 * Extended resource with server information
 */
export interface MCPResource extends Resource {
  /** The server that provides this resource */
  serverName: string;
}

/**
 * Result of a tool call
 */
export interface ToolCallResult {
  content: Array<{
    type: string;
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

/**
 * Manages connections to MCP servers
 */
export class MCPClientManager {
  private clients: Map<string, Client> = new Map();
  private transports: Map<string, StdioClientTransport> = new Map();
  private configs: Map<string, MCPServerConfig> = new Map();
  private toolCache: Map<string, MCPTool[]> = new Map();
  private initialized = false;

  constructor(configs: MCPServerConfig[] = []) {
    for (const config of configs) {
      this.configs.set(config.name, config);
    }
  }

  /**
   * Add a server configuration
   */
  addServer(config: MCPServerConfig): void {
    this.configs.set(config.name, config);
  }

  /**
   * Initialize all configured servers
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const initPromises: Promise<void>[] = [];

    for (const [name, config] of this.configs) {
      if (config.enabled === false) {
        console.log(`MCP server '${name}' is disabled, skipping`);
        continue;
      }

      initPromises.push(this.initializeServer(name, config));
    }

    await Promise.allSettled(initPromises);
    this.initialized = true;
  }

  /**
   * Initialize a single server
   */
  private async initializeServer(name: string, config: MCPServerConfig): Promise<void> {
    try {
      const env = {
        ...process.env,
        ...config.env,
      };

      // Resolve environment variable placeholders
      const resolvedEnv: Record<string, string> = {};
      for (const [key, value] of Object.entries(env)) {
        if (typeof value === "string" && value.startsWith("${") && value.endsWith("}")) {
          const envVar = value.slice(2, -1);
          resolvedEnv[key] = process.env[envVar] || "";
        } else if (value !== undefined) {
          resolvedEnv[key] = value;
        }
      }

      const transport = new StdioClientTransport({
        command: config.command,
        args: config.args,
        env: resolvedEnv,
      });

      const client = new Client(
        {
          name: "exact-va-client",
          version: "1.0.0",
        },
        {
          capabilities: {
            tools: {},
            resources: {},
          },
        }
      );

      await client.connect(transport);

      this.clients.set(name, client);
      this.transports.set(name, transport);

      // Pre-fetch tools
      await this.refreshTools(name);

      console.log(`MCP server '${name}' connected successfully`);
    } catch (error) {
      console.error(`Failed to initialize MCP server '${name}':`, error);
      throw error;
    }
  }

  /**
   * Refresh the tool cache for a server
   */
  private async refreshTools(serverName: string): Promise<void> {
    const client = this.clients.get(serverName);
    if (!client) {
      return;
    }

    try {
      const { tools } = await client.listTools();
      const mcpTools: MCPTool[] = tools.map((tool) => ({
        ...tool,
        serverName,
      }));
      this.toolCache.set(serverName, mcpTools);
    } catch (error) {
      console.error(`Failed to refresh tools for '${serverName}':`, error);
      this.toolCache.set(serverName, []);
    }
  }

  /**
   * Get all available tools from all connected servers
   */
  async listAllTools(): Promise<MCPTool[]> {
    const allTools: MCPTool[] = [];

    for (const [serverName, tools] of this.toolCache) {
      allTools.push(...tools);
    }

    return allTools;
  }

  /**
   * Get tools from a specific server
   */
  async listTools(serverName: string): Promise<MCPTool[]> {
    return this.toolCache.get(serverName) || [];
  }

  /**
   * Call a tool on a specific server
   */
  async callTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<ToolCallResult> {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`MCP server '${serverName}' not connected`);
    }

    const result = await client.callTool({
      name: toolName,
      arguments: args,
    });

    return result as ToolCallResult;
  }

  /**
   * Call a tool using the combined server__tool name format
   */
  async callToolByFullName(
    fullName: string,
    args: Record<string, unknown>
  ): Promise<ToolCallResult> {
    const separatorIndex = fullName.indexOf("__");
    if (separatorIndex === -1) {
      throw new Error(
        `Invalid tool name format: ${fullName}. Expected 'server__tool' format.`
      );
    }

    const serverName = fullName.slice(0, separatorIndex);
    const toolName = fullName.slice(separatorIndex + 2);

    return this.callTool(serverName, toolName, args);
  }

  /**
   * List resources from a specific server
   */
  async listResources(serverName: string): Promise<MCPResource[]> {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`MCP server '${serverName}' not connected`);
    }

    const { resources } = await client.listResources();
    return resources.map((resource) => ({
      ...resource,
      serverName,
    }));
  }

  /**
   * Read a resource from a server
   */
  async readResource(serverName: string, uri: string): Promise<string> {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`MCP server '${serverName}' not connected`);
    }

    const result = await client.readResource({ uri });
    const content = result.contents[0];

    if (content && "text" in content) {
      return content.text;
    }

    return JSON.stringify(content);
  }

  /**
   * Check if a server is connected
   */
  isConnected(serverName: string): boolean {
    return this.clients.has(serverName);
  }

  /**
   * Get list of connected server names
   */
  getConnectedServers(): string[] {
    return Array.from(this.clients.keys());
  }

  /**
   * Disconnect from a specific server
   */
  async disconnect(serverName: string): Promise<void> {
    const client = this.clients.get(serverName);
    const transport = this.transports.get(serverName);

    if (client) {
      await client.close();
      this.clients.delete(serverName);
    }

    if (transport) {
      await transport.close();
      this.transports.delete(serverName);
    }

    this.toolCache.delete(serverName);
  }

  /**
   * Disconnect from all servers
   */
  async disconnectAll(): Promise<void> {
    const disconnectPromises: Promise<void>[] = [];

    for (const serverName of this.clients.keys()) {
      disconnectPromises.push(this.disconnect(serverName));
    }

    await Promise.allSettled(disconnectPromises);
    this.initialized = false;
  }

  /**
   * Get server status
   */
  getStatus(): Record<string, { connected: boolean; toolCount: number }> {
    const status: Record<string, { connected: boolean; toolCount: number }> = {};

    for (const [name] of this.configs) {
      const connected = this.clients.has(name);
      const tools = this.toolCache.get(name) || [];

      status[name] = {
        connected,
        toolCount: tools.length,
      };
    }

    return status;
  }
}

export default MCPClientManager;
