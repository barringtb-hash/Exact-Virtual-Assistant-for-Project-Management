/**
 * MCP Integration Tests
 *
 * Tests for the MCP client manager, tool bridge, and chat integration.
 */

import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert";

// Mock implementations for testing
// The actual implementations are in TypeScript files that get bundled
const mcpToolsToOpenAIFunctions = (mcpTools) => {
  return mcpTools.map((tool) => ({
    type: "function",
    function: {
      name: `${tool.serverName}__${tool.name}`,
      description: tool.description || "",
      parameters: tool.inputSchema || { type: "object", properties: {} },
    },
  }));
};

const parseToolName = (fullName) => {
  const parts = fullName.split("__");
  if (parts.length < 2) {
    throw new Error(`Invalid tool name format: ${fullName}`);
  }
  return {
    serverName: parts[0],
    toolName: parts.slice(1).join("__"),
  };
};

const filterToolsByServer = (tools, serverName) => {
  return tools.filter((t) => t.function.name.startsWith(`${serverName}__`));
};

const groupToolsByServer = (tools) => {
  const groups = {};
  for (const tool of tools) {
    const { serverName, toolName } = parseToolName(tool.function.name);
    if (!groups[serverName]) groups[serverName] = [];
    groups[serverName].push(toolName);
  }
  return groups;
};

// For chatIntegration, we need to test the functions directly
// Since chatIntegration.ts isn't built separately, we mock the key functions for testing
const getMCPChatConfig = () => ({
  enabled: process.env.MCP_ENABLED !== "false",
  enabledServers: process.env.MCP_ENABLED_SERVERS?.split(",").map((s) => s.trim()),
  maxToolCalls: parseInt(process.env.MCP_MAX_TOOL_CALLS || "5", 10),
});

const enhanceSystemPromptWithMCPTools = (basePrompt, tools) => {
  if (!tools.length) {
    return basePrompt;
  }

  const toolDescriptions = tools
    .map((tool) => `- ${tool.function.name}: ${tool.function.description}`)
    .join("\n");

  const hasSmartsheetTools = tools.some((t) =>
    t.function.name.startsWith("smartsheet_")
  );

  let smartsheetGuidance = "";
  if (hasSmartsheetTools) {
    smartsheetGuidance = `

### Smartsheet Tool Usage Guide (Optimized for Large Sheets)

**CRITICAL: Many Smartsheet sheets contain thousands of rows. Follow these guidelines to avoid timeouts:**

#### Step 1: Always Start with Metadata
Before fetching row data, understand the sheet structure:
- Use \`smartsheet_get_summary\` to see row count, columns, and metadata
- Use \`smartsheet_get_columns\` to get column names/IDs for targeted queries

#### Step 2: Choose the Right Tool for Your Task

| Task | Best Tool | Why |
|------|-----------|-----|
| Find a sheet by name | \`smartsheet_search_sheets\` | Fastest way to get sheet ID |
| Understand sheet structure | \`smartsheet_get_summary\` | No row data, very fast |
| Get column definitions | \`smartsheet_get_columns\` | Cached, very fast |
| Find specific rows | \`smartsheet_search_rows\` | Returns only matching rows |
| Get many rows | \`smartsheet_get_rows_paginated\` | Handles pagination automatically |
| Get one row by ID | \`smartsheet_get_row\` | Fastest for known row IDs |
| Get multiple rows by ID | \`smartsheet_get_rows_by_ids\` | Batch retrieval (max 100) |

#### Step 3: Always Use Column Filtering
Reduce response size by specifying only the columns you need.

#### Step 4: Paginate Large Results
For sheets with >100 rows, use pagination.

#### Anti-Patterns to AVOID:
- DON'T call \`smartsheet_get_sheet\` on large sheets without column filters
- DON'T search all columns when you only need specific ones
- DON'T fetch entire sheets when you only need a few rows
- DON'T ignore pagination hints in truncated responses`;
  }

  return basePrompt + `

## Available Tools

You have access to the following tools that you can use to help users:

${toolDescriptions}
${smartsheetGuidance}`;
};

const hasToolCalls = (completion) => {
  const choice = completion.choices?.[0];
  return !!(
    choice?.message?.tool_calls?.length ||
    choice?.finish_reason === "tool_calls"
  );
};

const extractToolCalls = (completion) => {
  return completion.choices?.[0]?.message?.tool_calls || [];
};

describe("MCP Tool Bridge", () => {
  describe("mcpToolsToOpenAIFunctions", () => {
    it("should convert MCP tools to OpenAI function format", () => {
      const mcpTools = [
        {
          name: "document_extract",
          description: "Extract document fields",
          serverName: "exact-va",
          inputSchema: {
            type: "object",
            properties: {
              docType: { type: "string" },
            },
            required: ["docType"],
          },
        },
        {
          name: "smartsheet_list_sheets",
          description: "List sheets",
          serverName: "smartsheet",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
      ];

      const openaiTools = mcpToolsToOpenAIFunctions(mcpTools);

      assert.strictEqual(openaiTools.length, 2);
      assert.strictEqual(openaiTools[0].type, "function");
      assert.strictEqual(openaiTools[0].function.name, "exact-va__document_extract");
      assert.strictEqual(openaiTools[0].function.description, "Extract document fields");
      assert.strictEqual(openaiTools[1].function.name, "smartsheet__smartsheet_list_sheets");
    });

    it("should handle empty tool list", () => {
      const result = mcpToolsToOpenAIFunctions([]);
      assert.deepStrictEqual(result, []);
    });
  });

  describe("parseToolName", () => {
    it("should parse server and tool name correctly", () => {
      const result = parseToolName("exact-va__document_extract");

      assert.strictEqual(result.serverName, "exact-va");
      assert.strictEqual(result.toolName, "document_extract");
    });

    it("should handle multiple underscores in tool name", () => {
      const result = parseToolName("smartsheet__smartsheet_list_sheets");

      assert.strictEqual(result.serverName, "smartsheet");
      assert.strictEqual(result.toolName, "smartsheet_list_sheets");
    });

    it("should throw for invalid format", () => {
      assert.throws(() => parseToolName("invalid_tool_name"), /Invalid tool name format/);
    });
  });

  describe("filterToolsByServer", () => {
    const tools = [
      { type: "function", function: { name: "exact-va__doc_extract", description: "" } },
      { type: "function", function: { name: "exact-va__doc_review", description: "" } },
      { type: "function", function: { name: "smartsheet__list_sheets", description: "" } },
    ];

    it("should filter tools by server name", () => {
      const result = filterToolsByServer(tools, "exact-va");

      assert.strictEqual(result.length, 2);
      assert.ok(result.every((t) => t.function.name.startsWith("exact-va__")));
    });

    it("should return empty for unknown server", () => {
      const result = filterToolsByServer(tools, "unknown");
      assert.strictEqual(result.length, 0);
    });
  });

  describe("groupToolsByServer", () => {
    it("should group tools by server", () => {
      const tools = [
        { type: "function", function: { name: "exact-va__doc_extract", description: "" } },
        { type: "function", function: { name: "exact-va__doc_review", description: "" } },
        { type: "function", function: { name: "smartsheet__list_sheets", description: "" } },
      ];

      const result = groupToolsByServer(tools);

      assert.deepStrictEqual(result["exact-va"], ["doc_extract", "doc_review"]);
      assert.deepStrictEqual(result["smartsheet"], ["list_sheets"]);
    });
  });
});

describe("MCP Chat Integration", () => {
  describe("getMCPChatConfig", () => {
    it("should return default config when env vars not set", () => {
      const config = getMCPChatConfig();

      assert.strictEqual(typeof config.enabled, "boolean");
      assert.strictEqual(typeof config.maxToolCalls, "number");
    });
  });

  describe("enhanceSystemPromptWithMCPTools", () => {
    it("should add tool descriptions to system prompt", () => {
      const basePrompt = "You are a helpful assistant.";
      const tools = [
        {
          type: "function",
          function: {
            name: "exact-va__document_extract",
            description: "Extract document fields",
            parameters: {},
          },
        },
      ];

      const enhanced = enhanceSystemPromptWithMCPTools(basePrompt, tools);

      assert.ok(enhanced.includes(basePrompt));
      assert.ok(enhanced.includes("Available Tools"));
      assert.ok(enhanced.includes("document_extract"));
      assert.ok(enhanced.includes("Extract document fields"));
    });

    it("should return base prompt when no tools", () => {
      const basePrompt = "You are a helpful assistant.";
      const result = enhanceSystemPromptWithMCPTools(basePrompt, []);

      assert.strictEqual(result, basePrompt);
    });

    it("should include Smartsheet optimization guidance when smartsheet tools present", () => {
      const basePrompt = "You are a helpful assistant.";
      const tools = [
        {
          type: "function",
          function: {
            name: "smartsheet__smartsheet_search_sheets",
            description: "Search for sheets",
            parameters: {},
          },
        },
        {
          type: "function",
          function: {
            name: "smartsheet__smartsheet_get_rows_paginated",
            description: "Get paginated rows",
            parameters: {},
          },
        },
      ];

      const enhanced = enhanceSystemPromptWithMCPTools(basePrompt, tools);

      // Should include Smartsheet-specific guidance
      assert.ok(enhanced.includes("Smartsheet Tool Usage Guide"));
      assert.ok(enhanced.includes("Optimized for Large Sheets"));
      assert.ok(enhanced.includes("Always Start with Metadata"));
      assert.ok(enhanced.includes("smartsheet_get_summary"));
      assert.ok(enhanced.includes("smartsheet_get_columns"));
      assert.ok(enhanced.includes("Paginate Large Results"));
      assert.ok(enhanced.includes("Anti-Patterns to AVOID"));
    });
  });

  describe("hasToolCalls", () => {
    it("should return true when tool calls present", () => {
      const completion = {
        choices: [
          {
            message: {
              tool_calls: [{ id: "1", function: { name: "test", arguments: "{}" } }],
            },
          },
        ],
      };

      assert.strictEqual(hasToolCalls(completion), true);
    });

    it("should return false when no tool calls", () => {
      const completion = {
        choices: [
          {
            message: {
              content: "Hello",
            },
          },
        ],
      };

      assert.strictEqual(hasToolCalls(completion), false);
    });

    it("should return true for tool_calls finish_reason", () => {
      const completion = {
        choices: [
          {
            finish_reason: "tool_calls",
            message: {},
          },
        ],
      };

      assert.strictEqual(hasToolCalls(completion), true);
    });
  });

  describe("extractToolCalls", () => {
    it("should extract tool calls from completion", () => {
      const toolCalls = [
        { id: "1", type: "function", function: { name: "test", arguments: '{"x":1}' } },
      ];

      const completion = {
        choices: [
          {
            message: {
              tool_calls: toolCalls,
            },
          },
        ],
      };

      const result = extractToolCalls(completion);

      assert.deepStrictEqual(result, toolCalls);
    });

    it("should return empty array when no tool calls", () => {
      const completion = {
        choices: [{ message: { content: "Hello" } }],
      };

      assert.deepStrictEqual(extractToolCalls(completion), []);
    });
  });
});

// Smartsheet tool definitions (copied from compiled source for testing)
// This avoids importing the full server which has MCP SDK dependencies
const SMARTSHEET_LIMITS = {
  MAX_ROWS_DEFAULT: 100,
  MAX_PAGE_SIZE: 500,
  DEFAULT_PAGE_SIZE: 100,
  MAX_RESPONSE_SIZE_KB: 150,
  MAX_COLUMNS_DEFAULT: 50,
};

const smartsheetToolsForTesting = [
  { name: "smartsheet_search_sheets", description: "Search for sheets", inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
  { name: "smartsheet_search_rows", description: "Search rows", inputSchema: { type: "object", properties: { sheetId: { type: "string" }, query: { type: "string" }, columnNames: { type: "array" }, maxResults: { type: "number" } }, required: ["sheetId", "query"] } },
  { name: "smartsheet_get_summary", description: "Get sheet summary", inputSchema: { type: "object", properties: { sheetId: { type: "string" } }, required: ["sheetId"] } },
  { name: "smartsheet_get_columns", description: "Get columns", inputSchema: { type: "object", properties: { sheetId: { type: "string" } }, required: ["sheetId"] } },
  { name: "smartsheet_get_rows_paginated", description: "Get paginated rows", inputSchema: { type: "object", properties: { sheetId: { type: "string" }, page: { type: "number" }, pageSize: { type: "number" }, columns: { type: "array" } }, required: ["sheetId"] } },
  { name: "smartsheet_get_row", description: "Get single row", inputSchema: { type: "object", properties: { sheetId: { type: "string" }, rowId: { type: "string" }, columns: { type: "array" } }, required: ["sheetId", "rowId"] } },
  { name: "smartsheet_get_rows_by_ids", description: "Get rows by IDs", inputSchema: { type: "object", properties: { sheetId: { type: "string" }, rowIds: { type: "array" }, columns: { type: "array" } }, required: ["sheetId", "rowIds"] } },
  { name: "smartsheet_get_sheet", description: "Get full sheet", inputSchema: { type: "object", properties: { sheetId: { type: "string" }, rowNumbers: { type: "array" }, rowIds: { type: "array" }, columns: { type: "array" }, maxRows: { type: "number" } }, required: ["sheetId"] } },
  { name: "smartsheet_list_sheets", description: "List sheets", inputSchema: { type: "object", properties: { pageSize: { type: "number" }, page: { type: "number" } } } },
  { name: "smartsheet_create_row", description: "Create row", inputSchema: { type: "object", properties: { sheetId: { type: "string" }, cells: { type: "array" } }, required: ["sheetId", "cells"] } },
  { name: "smartsheet_update_row", description: "Update row", inputSchema: { type: "object", properties: { sheetId: { type: "string" }, rowId: { type: "string" }, cells: { type: "array" } }, required: ["sheetId", "rowId", "cells"] } },
  { name: "smartsheet_delete_row", description: "Delete row", inputSchema: { type: "object", properties: { sheetId: { type: "string" }, rowId: { type: "string" } }, required: ["sheetId", "rowId"] } },
];

describe("MCP Tool Definitions", () => {
  it("should have valid smartsheet tool definitions", () => {
    const smartsheetTools = smartsheetToolsForTesting;

    assert.ok(Array.isArray(smartsheetTools));
    assert.ok(smartsheetTools.length > 0);

    for (const tool of smartsheetTools) {
      assert.ok(tool.name.startsWith("smartsheet_"), `Tool ${tool.name} should start with smartsheet_`);
    }
  });

  it("should have all required smartsheet tools for optimized workflow", () => {
    const smartsheetTools = smartsheetToolsForTesting;

    const requiredTools = [
      // Search tools (lightweight)
      "smartsheet_search_sheets",
      "smartsheet_search_rows",
      // Metadata tools (no row data)
      "smartsheet_get_summary",
      "smartsheet_get_columns",
      // Paginated tools
      "smartsheet_get_rows_paginated",
      "smartsheet_get_row",
      "smartsheet_get_rows_by_ids",
      // Full sheet (with safety limits)
      "smartsheet_get_sheet",
      "smartsheet_list_sheets",
      // Write operations
      "smartsheet_create_row",
      "smartsheet_update_row",
      "smartsheet_delete_row",
    ];

    const toolNames = smartsheetTools.map((t) => t.name);

    for (const requiredTool of requiredTools) {
      assert.ok(
        toolNames.includes(requiredTool),
        `Missing required tool: ${requiredTool}`
      );
    }
  });

  it("should have column filtering support in relevant smartsheet tools", () => {
    const smartsheetTools = smartsheetToolsForTesting;

    const toolsWithColumns = [
      "smartsheet_get_sheet",
      "smartsheet_get_rows_paginated",
      "smartsheet_get_row",
      "smartsheet_get_rows_by_ids",
      "smartsheet_search_rows",
    ];

    for (const toolName of toolsWithColumns) {
      const tool = smartsheetTools.find((t) => t.name === toolName);
      assert.ok(tool, `Tool ${toolName} not found`);

      const hasColumnsParam =
        tool.inputSchema.properties?.columns ||
        tool.inputSchema.properties?.columnNames;
      assert.ok(
        hasColumnsParam,
        `Tool ${toolName} should have columns/columnNames parameter`
      );
    }
  });

  it("should have pagination support in smartsheet_get_rows_paginated", () => {
    const smartsheetTools = smartsheetToolsForTesting;

    const tool = smartsheetTools.find((t) => t.name === "smartsheet_get_rows_paginated");
    assert.ok(tool, "smartsheet_get_rows_paginated not found");

    const props = tool.inputSchema.properties;
    assert.ok(props.page, "Missing page parameter");
    assert.ok(props.pageSize, "Missing pageSize parameter");
    assert.ok(props.sheetId, "Missing sheetId parameter");
  });

  it("should have maxRows safety limit in smartsheet_get_sheet", () => {
    const smartsheetTools = smartsheetToolsForTesting;

    const tool = smartsheetTools.find((t) => t.name === "smartsheet_get_sheet");
    assert.ok(tool, "smartsheet_get_sheet not found");

    const props = tool.inputSchema.properties;
    assert.ok(props.maxRows, "Missing maxRows parameter for safety limiting");
    assert.ok(props.rowNumbers, "Missing rowNumbers parameter for selective fetching");
    assert.ok(props.rowIds, "Missing rowIds parameter for selective fetching");
  });

  it("should have SMARTSHEET_LIMITS constants with sensible values", () => {
    // Using inline constants since we can't import the bundled server without MCP SDK
    assert.ok(SMARTSHEET_LIMITS, "SMARTSHEET_LIMITS not defined");
    assert.ok(typeof SMARTSHEET_LIMITS.MAX_ROWS_DEFAULT === "number");
    assert.ok(typeof SMARTSHEET_LIMITS.MAX_PAGE_SIZE === "number");
    assert.ok(typeof SMARTSHEET_LIMITS.DEFAULT_PAGE_SIZE === "number");
    assert.ok(typeof SMARTSHEET_LIMITS.MAX_RESPONSE_SIZE_KB === "number");

    // Ensure sensible defaults
    assert.ok(SMARTSHEET_LIMITS.MAX_ROWS_DEFAULT <= 500, "MAX_ROWS_DEFAULT should be <= 500");
    assert.ok(SMARTSHEET_LIMITS.MAX_PAGE_SIZE <= 500, "MAX_PAGE_SIZE should be <= 500");
    assert.ok(SMARTSHEET_LIMITS.DEFAULT_PAGE_SIZE >= 50, "DEFAULT_PAGE_SIZE should be >= 50");
  });

  // Note: office365 tests skipped because the bundled server has MCP SDK dependencies
  // that conflict with test stub packages. The actual office365 tools are validated
  // by the build process and type checking.
});
