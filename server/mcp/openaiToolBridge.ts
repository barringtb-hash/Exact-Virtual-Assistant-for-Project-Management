/**
 * OpenAI Tool Bridge
 *
 * Converts MCP tools to OpenAI function calling format and handles
 * tool call execution.
 */

import type { MCPTool, MCPClientManager, ToolCallResult } from "./MCPClientManager.js";

/**
 * OpenAI function definition
 */
export interface OpenAIFunction {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/**
 * OpenAI tool call from chat completion
 */
export interface OpenAIToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * Result of processing a tool call
 */
export interface ToolCallProcessResult {
  toolCallId: string;
  name: string;
  result: string;
  isError: boolean;
}

/**
 * Convert MCP tools to OpenAI function definitions
 *
 * Uses the format: serverName__toolName for the function name
 */
export function mcpToolsToOpenAIFunctions(mcpTools: MCPTool[]): OpenAIFunction[] {
  return mcpTools.map((tool) => ({
    type: "function" as const,
    function: {
      name: `${tool.serverName}__${tool.name}`,
      description: tool.description || "",
      parameters: tool.inputSchema || { type: "object", properties: {} },
    },
  }));
}

/**
 * Parse the tool name to extract server and tool names
 */
export function parseToolName(fullName: string): { serverName: string; toolName: string } {
  const separatorIndex = fullName.indexOf("__");
  if (separatorIndex === -1) {
    throw new Error(
      `Invalid tool name format: ${fullName}. Expected 'serverName__toolName' format.`
    );
  }

  return {
    serverName: fullName.slice(0, separatorIndex),
    toolName: fullName.slice(separatorIndex + 2),
  };
}

/**
 * Handle a single OpenAI tool call
 */
export async function handleOpenAIToolCall(
  mcpManager: MCPClientManager,
  toolCall: OpenAIToolCall
): Promise<ToolCallProcessResult> {
  const { name, arguments: argsString } = toolCall.function;

  try {
    // Parse the arguments
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(argsString);
    } catch (parseError) {
      return {
        toolCallId: toolCall.id,
        name,
        result: JSON.stringify({
          error: "Failed to parse tool arguments",
          details: argsString,
        }),
        isError: true,
      };
    }

    // Parse the tool name
    const { serverName, toolName } = parseToolName(name);

    // Call the tool
    const result = await mcpManager.callTool(serverName, toolName, args);

    // Extract text content from the result
    const textContent = result.content
      .filter((c): c is { type: string; text: string } => c.type === "text" && typeof c.text === "string")
      .map((c) => c.text)
      .join("\n");

    return {
      toolCallId: toolCall.id,
      name,
      result: textContent || JSON.stringify(result.content),
      isError: result.isError || false,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      toolCallId: toolCall.id,
      name,
      result: JSON.stringify({ error: errorMessage }),
      isError: true,
    };
  }
}

/**
 * Handle multiple OpenAI tool calls in parallel
 */
export async function handleOpenAIToolCalls(
  mcpManager: MCPClientManager,
  toolCalls: OpenAIToolCall[]
): Promise<ToolCallProcessResult[]> {
  const results = await Promise.all(
    toolCalls.map((toolCall) => handleOpenAIToolCall(mcpManager, toolCall))
  );

  return results;
}

/**
 * Convert tool call results to OpenAI message format
 */
export function toolResultsToMessages(
  results: ToolCallProcessResult[]
): Array<{ role: "tool"; tool_call_id: string; content: string }> {
  return results.map((result) => ({
    role: "tool" as const,
    tool_call_id: result.toolCallId,
    content: result.result,
  }));
}

/**
 * Create a tool executor function for use with OpenAI chat completions
 *
 * This returns a function that can be called to execute tool calls and
 * return messages to continue the conversation.
 */
export function createToolExecutor(mcpManager: MCPClientManager) {
  return async function executeTools(
    toolCalls: OpenAIToolCall[]
  ): Promise<Array<{ role: "tool"; tool_call_id: string; content: string }>> {
    const results = await handleOpenAIToolCalls(mcpManager, toolCalls);
    return toolResultsToMessages(results);
  };
}

/**
 * Filter tools by server name
 */
export function filterToolsByServer(
  tools: OpenAIFunction[],
  serverName: string
): OpenAIFunction[] {
  return tools.filter((tool) => tool.function.name.startsWith(`${serverName}__`));
}

/**
 * Get tool names grouped by server
 */
export function groupToolsByServer(
  tools: OpenAIFunction[]
): Record<string, string[]> {
  const groups: Record<string, string[]> = {};

  for (const tool of tools) {
    try {
      const { serverName, toolName } = parseToolName(tool.function.name);
      if (!groups[serverName]) {
        groups[serverName] = [];
      }
      groups[serverName].push(toolName);
    } catch {
      // Skip tools with invalid names
    }
  }

  return groups;
}

export default {
  mcpToolsToOpenAIFunctions,
  handleOpenAIToolCall,
  handleOpenAIToolCalls,
  toolResultsToMessages,
  createToolExecutor,
  parseToolName,
  filterToolsByServer,
  groupToolsByServer,
};
