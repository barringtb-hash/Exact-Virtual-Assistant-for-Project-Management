/**
 * Exact Virtual Assistant MCP Server
 *
 * Exposes document generation, validation, review, and rendering capabilities
 * as MCP tools that AI can orchestrate autonomously.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { exactVATools } from "./tools.js";
import { staticResources } from "./resources.js";
import * as handlers from "./handlers.js";

/**
 * Context passed to tool handlers
 */
export interface ToolContext {
  sessionId?: string;
  conversationId?: string;
  draftStore?: Map<string, unknown>;
  reviewCache?: Map<string, unknown>;
}

/**
 * Create and configure the MCP server
 */
export function createServer(context: ToolContext = {}): Server {
  const server = new Server(
    {
      name: "exact-va",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: exactVATools };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case "document_extract":
          return await handlers.handleDocumentExtract(args, context);

        case "document_validate":
          return await handlers.handleDocumentValidate(args, context);

        case "document_review":
          return await handlers.handleDocumentReview(args, context);

        case "document_render":
          return await handlers.handleDocumentRender(args, context);

        case "document_analyze":
          return await handlers.handleDocumentAnalyze(args, context);

        case "field_feedback":
          return await handlers.handleFieldFeedback(args, context);

        case "draft_update":
          return await handlers.handleDraftUpdate(args, context);

        case "guided_navigate":
          return await handlers.handleGuidedNavigate(args, context);

        default:
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ error: `Unknown tool: ${name}` }),
              },
            ],
            isError: true,
          };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Tool ${name} error:`, error);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: errorMessage,
              tool: name,
            }),
          },
        ],
        isError: true,
      };
    }
  });

  // List available resources
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return { resources: staticResources };
  });

  // Read resource content
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    try {
      const content = await handlers.handleReadResource(uri, context);
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(content, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to read resource ${uri}: ${errorMessage}`);
    }
  });

  return server;
}

/**
 * Main entry point - runs the server via stdio
 */
async function main() {
  const context: ToolContext = {
    draftStore: new Map(),
    reviewCache: new Map(),
  };

  const server = createServer(context);
  const transport = new StdioServerTransport();

  await server.connect(transport);

  console.error("Exact VA MCP Server running on stdio");
}

// Run if executed directly
const isMainModule =
  typeof process !== "undefined" &&
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"));

if (isMainModule) {
  main().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
  });
}

export default createServer;
