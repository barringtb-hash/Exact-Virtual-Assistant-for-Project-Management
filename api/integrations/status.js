/**
 * MCP Integration Status Endpoint
 *
 * Returns the current status of MCP integration and connected services.
 *
 * GET /api/integrations/status
 */

import {
  getOrCreateMCPManager,
  getMCPChatConfig,
  getMCPConfig,
} from "../../server/mcp/index.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  try {
    const mcpConfig = getMCPChatConfig();

    // Base response structure
    const response = {
      enabled: mcpConfig.enabled,
      servers: {},
      tools: [],
      config: {
        maxToolCalls: mcpConfig.maxToolCalls,
        enabledServers: mcpConfig.enabledServers,
      },
    };

    if (!mcpConfig.enabled) {
      response.message = "MCP integration is disabled";
      res.status(200).json(response);
      return;
    }

    // Get server configurations
    const serverConfigs = getMCPConfig();
    for (const config of serverConfigs) {
      response.servers[config.name] = {
        enabled: config.enabled,
        command: config.command,
        requiredEnv: config.requiredEnv || [],
        envConfigured: config.requiredEnv
          ? config.requiredEnv.every((envVar) => {
              const value = process.env[envVar];
              return value && value.trim().length > 0;
            })
          : true,
      };
    }

    // Try to get available tools from the MCP manager
    try {
      const mcpManager = await getOrCreateMCPManager();
      const tools = await mcpManager.listAllTools();

      response.tools = tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        serverName: tool.serverName,
      }));

      // Update server connection status
      for (const tool of tools) {
        if (response.servers[tool.serverName]) {
          response.servers[tool.serverName].connected = true;
        }
      }
    } catch (mcpErr) {
      response.mcpError = mcpErr.message;
    }

    // Provide summary
    const connectedServers = Object.entries(response.servers)
      .filter(([_, info]) => info.connected)
      .map(([name]) => name);

    response.summary = {
      totalServers: Object.keys(response.servers).length,
      connectedServers: connectedServers.length,
      availableTools: response.tools.length,
      serverNames: connectedServers,
    };

    res.status(200).json(response);
  } catch (err) {
    console.error("MCP status check failed:", err);
    res.status(500).json({
      error: "Failed to check MCP integration status",
      message: err.message,
    });
  }
}
