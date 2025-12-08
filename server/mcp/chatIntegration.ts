/**
 * MCP Chat Integration
 *
 * Provides helper functions to integrate MCP tools with the chat handler.
 * This module is designed to be used by the existing chat.js without
 * requiring major modifications.
 */

import type { MCPClientManager } from "./MCPClientManager.js";
import { mcpToolsToOpenAIFunctions, handleOpenAIToolCalls } from "./openaiToolBridge.js";
import type { OpenAIFunction, OpenAIToolCall } from "./openaiToolBridge.js";

/**
 * Configuration for MCP chat integration
 */
export interface MCPChatConfig {
  /** Enable MCP tools in chat */
  enabled: boolean;
  /** Only enable specific servers */
  enabledServers?: string[];
  /** Maximum tool calls per request */
  maxToolCalls?: number;
}

/**
 * Get default MCP chat configuration from environment
 */
export function getMCPChatConfig(): MCPChatConfig {
  return {
    enabled: process.env.MCP_ENABLED !== "false",
    enabledServers: process.env.MCP_ENABLED_SERVERS?.split(",").map((s) =>
      s.trim()
    ),
    maxToolCalls: parseInt(process.env.MCP_MAX_TOOL_CALLS || "5", 10),
  };
}

/**
 * Get MCP tools formatted for OpenAI
 *
 * Returns an array of tool definitions that can be passed to OpenAI's
 * chat.completions.create() or responses.create() calls.
 */
export async function getMCPToolsForOpenAI(
  mcpManager: MCPClientManager,
  config?: MCPChatConfig
): Promise<OpenAIFunction[]> {
  const cfg = config || getMCPChatConfig();

  if (!cfg.enabled) {
    return [];
  }

  const allTools = await mcpManager.listAllTools();

  // Filter by enabled servers if specified
  const filteredTools = cfg.enabledServers
    ? allTools.filter((tool) => cfg.enabledServers!.includes(tool.serverName))
    : allTools;

  return mcpToolsToOpenAIFunctions(filteredTools);
}

/**
 * Process tool calls from an OpenAI completion
 *
 * Takes the tool_calls from a completion response and executes them
 * via MCP, returning messages to continue the conversation.
 */
export async function processMCPToolCalls(
  mcpManager: MCPClientManager,
  toolCalls: OpenAIToolCall[],
  config?: MCPChatConfig
): Promise<Array<{ role: "tool"; tool_call_id: string; content: string }>> {
  const cfg = config || getMCPChatConfig();

  if (!cfg.enabled || !toolCalls.length) {
    return [];
  }

  // Limit number of tool calls
  const maxCalls = cfg.maxToolCalls || 5;
  const limitedCalls = toolCalls.slice(0, maxCalls);

  const results = await handleOpenAIToolCalls(mcpManager, limitedCalls);

  return results.map((result) => ({
    role: "tool" as const,
    tool_call_id: result.toolCallId,
    content: result.result,
  }));
}

/**
 * Enhanced system prompt that includes MCP tool availability
 */
export function enhanceSystemPromptWithMCPTools(
  basePrompt: string,
  tools: OpenAIFunction[]
): string {
  if (!tools.length) {
    return basePrompt;
  }

  const toolDescriptions = tools
    .map((tool) => `- ${tool.function.name}: ${tool.function.description}`)
    .join("\n");

  // Check if Smartsheet tools are available
  const hasSmartsheetTools = tools.some((t) =>
    t.function.name.startsWith("smartsheet_")
  );

  let smartsheetGuidance = "";
  if (hasSmartsheetTools) {
    smartsheetGuidance = `

### Smartsheet Tool Usage Guide (Optimized for Large Sheets)

**CRITICAL: NEVER ask users for sheet IDs. Always use the sheet NAME to look up the ID automatically.**

#### GOLDEN RULE: Use Convenience Tools First
When a user mentions a sheet by name, use these tools that handle ID lookup automatically:

| User Request | Best Tool | Why |
|--------------|-----------|-----|
| "Show me the Project Plan sheet" | \`smartsheet_get_by_name("Project Plan")\` | Auto-finds sheet ID and returns summary |
| "Get data from Budget Tracker" | \`smartsheet_find_and_get_rows("Budget Tracker")\` | Finds sheet AND returns rows in one call |
| "Search for tasks in Sprint Board" | \`smartsheet_find_and_get_rows("Sprint Board", searchQuery="task")\` | Combined lookup + search |

#### Step-by-Step: How to Handle Sheet Requests

1. **User mentions sheet name** → Use \`smartsheet_get_by_name\` or \`smartsheet_find_and_get_rows\`
2. **Tool returns sheetId** → Store it for subsequent operations
3. **Need more data?** → Use the returned sheetId with other tools

#### Tool Selection Guide

| Task | Best Tool | Why |
|------|-----------|-----|
| Find sheet + get summary | \`smartsheet_get_by_name\` | **RECOMMENDED** - Returns ID + structure |
| Find sheet + get rows | \`smartsheet_find_and_get_rows\` | **RECOMMENDED** - Combined operation |
| Get column definitions | \`smartsheet_get_columns\` | Cached, very fast |
| Find specific rows | \`smartsheet_search_rows\` | Returns only matching rows |
| Get many rows | \`smartsheet_get_rows_paginated\` | Handles pagination automatically |
| Get one row by ID | \`smartsheet_get_row\` | Fastest for known row IDs |

#### Always Use Column Filtering
Reduce response size by specifying only the columns you need:
\`\`\`
smartsheet_find_and_get_rows("Project Plan", columns=["Name", "Status", "Due Date"])
smartsheet_get_rows_paginated(sheetId, page=1, columns=["Name", "Owner"])
\`\`\`

#### Paginate Large Results
For sheets with >100 rows, use pagination:
\`\`\`
smartsheet_find_and_get_rows("Project Plan", maxRows=50, page=1)
// Check hasNextPage in response, then call with page=2
\`\`\`

#### Anti-Patterns to AVOID:
- **NEVER** ask the user for a sheet ID - look it up by name instead
- DON'T call \`smartsheet_get_sheet\` on large sheets without column filters
- DON'T search all columns when you only need specific ones
- DON'T fetch entire sheets when you only need a few rows
- DON'T ignore pagination hints in truncated responses

#### Example Workflow: "Show me the Project Alpha tasks"
1. \`smartsheet_find_and_get_rows("Project Alpha", columns=["Task", "Status", "Owner"], maxRows=50)\`
   → Returns sheet ID, sheet info, AND rows in one call!

If you need the sheet ID for later operations, it's returned in every response as \`sheetId\`.`;
  }

  const mcpSection = `

## Available Tools

You have access to the following tools that you can use to help users:

${toolDescriptions}

When appropriate, use these tools to:
- Extract and validate document fields
- Review documents for quality
- Render documents to downloadable formats
- Import data from connected services (Smartsheet, SharePoint, etc.)
- Update project information
${smartsheetGuidance}

Always explain what you're doing when using tools, and summarize the results for the user.`;

  return basePrompt + mcpSection;
}

/**
 * Check if a completion response contains tool calls
 */
export function hasToolCalls(completion: {
  choices?: Array<{
    message?: {
      tool_calls?: unknown[];
    };
    finish_reason?: string;
  }>;
}): boolean {
  const choice = completion.choices?.[0];
  return !!(
    choice?.message?.tool_calls?.length ||
    choice?.finish_reason === "tool_calls"
  );
}

/**
 * Extract tool calls from a completion response
 */
export function extractToolCalls(completion: {
  choices?: Array<{
    message?: {
      tool_calls?: OpenAIToolCall[];
    };
  }>;
}): OpenAIToolCall[] {
  return completion.choices?.[0]?.message?.tool_calls || [];
}

/**
 * Create a tool-aware message handler
 *
 * This creates a function that can process chat messages with tool support,
 * automatically handling tool calls and continuing the conversation.
 */
export function createToolAwareHandler(
  mcpManager: MCPClientManager,
  openaiClient: {
    chat: {
      completions: {
        create: (params: unknown) => Promise<{
          choices?: Array<{
            message?: {
              content?: string;
              tool_calls?: OpenAIToolCall[];
            };
            finish_reason?: string;
          }>;
        }>;
      };
    };
  },
  config?: MCPChatConfig
) {
  const cfg = config || getMCPChatConfig();

  return async function handleWithTools(params: {
    model: string;
    messages: Array<{ role: string; content: string }>;
    temperature?: number;
    maxIterations?: number;
  }): Promise<{
    content: string;
    toolsUsed: string[];
    iterations: number;
  }> {
    const maxIterations = params.maxIterations || cfg.maxToolCalls || 5;
    const toolsUsed: string[] = [];
    let iterations = 0;

    // Get available tools
    const tools = await getMCPToolsForOpenAI(mcpManager, cfg);

    // Start with the initial messages
    let messages = [...params.messages];

    while (iterations < maxIterations) {
      iterations++;

      // Make the completion request
      const completion = await openaiClient.chat.completions.create({
        model: params.model,
        messages,
        temperature: params.temperature || 0.3,
        tools: tools.length ? tools : undefined,
      });

      const choice = completion.choices?.[0];

      // If no tool calls, we're done
      if (!choice?.message?.tool_calls?.length) {
        return {
          content: choice?.message?.content || "",
          toolsUsed,
          iterations,
        };
      }

      // Process tool calls
      const toolCalls = choice.message.tool_calls;
      toolsUsed.push(...toolCalls.map((tc) => tc.function.name));

      // Add assistant message with tool calls
      messages.push({
        role: "assistant",
        content: choice.message.content || "",
        tool_calls: toolCalls,
      } as unknown as { role: string; content: string });

      // Execute tools and add results
      const toolResults = await processMCPToolCalls(mcpManager, toolCalls, cfg);
      messages.push(...(toolResults as unknown as Array<{ role: string; content: string }>));
    }

    // If we hit max iterations, return what we have
    return {
      content: "Maximum tool iterations reached.",
      toolsUsed,
      iterations,
    };
  };
}

export default {
  getMCPChatConfig,
  getMCPToolsForOpenAI,
  processMCPToolCalls,
  enhanceSystemPromptWithMCPTools,
  hasToolCalls,
  extractToolCalls,
  createToolAwareHandler,
};
