/**
 * MCP Integration Module
 *
 * Provides MCP client management and OpenAI tool bridging for the
 * Exact Virtual Assistant.
 */

export { MCPClientManager } from "./MCPClientManager.js";
export type {
  MCPServerConfig,
  MCPTool,
  MCPResource,
  ToolCallResult,
} from "./MCPClientManager.js";

export {
  mcpToolsToOpenAIFunctions,
  handleOpenAIToolCall,
  handleOpenAIToolCalls,
  toolResultsToMessages,
  createToolExecutor,
  parseToolName,
  filterToolsByServer,
  groupToolsByServer,
} from "./openaiToolBridge.js";
export type {
  OpenAIFunction,
  OpenAIToolCall,
  ToolCallProcessResult,
} from "./openaiToolBridge.js";

export { getOrCreateMCPManager, getMCPConfig } from "./singleton.js";

export {
  getMCPChatConfig,
  getMCPToolsForOpenAI,
  processMCPToolCalls,
  enhanceSystemPromptWithMCPTools,
  hasToolCalls,
  extractToolCalls,
  createToolAwareHandler,
} from "./chatIntegration.js";
export type { MCPChatConfig } from "./chatIntegration.js";
