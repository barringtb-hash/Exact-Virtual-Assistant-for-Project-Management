/**
 * MCP Integration Tests
 *
 * Tests for the MCP client manager, tool bridge, and chat integration.
 */

import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert";

// Import the modules to test
import {
  mcpToolsToOpenAIFunctions,
  parseToolName,
  filterToolsByServer,
  groupToolsByServer,
} from "../server/mcp/openaiToolBridge.js";

import {
  getMCPChatConfig,
  enhanceSystemPromptWithMCPTools,
  hasToolCalls,
  extractToolCalls,
} from "../server/mcp/chatIntegration.js";

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

describe("MCP Tool Definitions", () => {
  it("should have valid exact-va tool definitions", async () => {
    const { exactVATools } = await import("../mcp-servers/exact-va/tools.js");

    assert.ok(Array.isArray(exactVATools));
    assert.ok(exactVATools.length > 0);

    for (const tool of exactVATools) {
      assert.ok(tool.name, `Tool missing name`);
      assert.ok(tool.description, `Tool ${tool.name} missing description`);
      assert.ok(tool.inputSchema, `Tool ${tool.name} missing inputSchema`);
      assert.strictEqual(tool.inputSchema.type, "object");
    }
  });

  it("should have valid smartsheet tool definitions", async () => {
    const { smartsheetTools } = await import("../mcp-servers/smartsheet/tools.js");

    assert.ok(Array.isArray(smartsheetTools));
    assert.ok(smartsheetTools.length > 0);

    for (const tool of smartsheetTools) {
      assert.ok(tool.name.startsWith("smartsheet_"), `Tool ${tool.name} should start with smartsheet_`);
    }
  });

  it("should have valid office365 tool definitions", async () => {
    const { office365Tools } = await import("../mcp-servers/office365/tools.js");

    assert.ok(Array.isArray(office365Tools));
    assert.ok(office365Tools.length > 0);

    // Check for expected tool prefixes
    const prefixes = ["sharepoint_", "teams_", "outlook_", "excel_"];
    for (const tool of office365Tools) {
      const hasValidPrefix = prefixes.some((prefix) => tool.name.startsWith(prefix));
      assert.ok(hasValidPrefix, `Tool ${tool.name} should start with one of: ${prefixes.join(", ")}`);
    }
  });
});
