/**
 * Smartsheet MCP Server
 *
 * Provides MCP tools for interacting with Smartsheet project management platform.
 * Enables AI to read project data, update rows, and sync with Smartsheet sheets.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { smartsheetTools } from "./tools.js";

const SMARTSHEET_API_BASE = "https://api.smartsheet.com/2.0";

// ============================================================================
// Security: Error Sanitization (MED-06)
// ============================================================================

/**
 * MED-06: Sanitize Smartsheet API error messages
 * Returns a generic error message to avoid leaking sensitive details
 */
function sanitizeSmartsheetError(status: number, errorBody: string): string {
  const statusMessages: Record<number, string> = {
    400: "Invalid request to Smartsheet API",
    401: "Smartsheet authentication failed",
    403: "Access denied to Smartsheet resource",
    404: "Smartsheet resource not found",
    429: "Smartsheet rate limit exceeded",
    500: "Smartsheet service error",
    502: "Smartsheet bad gateway",
    503: "Smartsheet service unavailable",
  };

  return statusMessages[status] || `Smartsheet API error (${status})`;
}

/**
 * Smartsheet API client
 */
class SmartsheetClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async request(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<unknown> {
    const response = await fetch(`${SMARTSHEET_API_BASE}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      // MED-06: Sanitize error to avoid leaking sensitive API response details
      const errorBody = await response.text();
      throw new Error(sanitizeSmartsheetError(response.status, errorBody));
    }

    return response.json();
  }

  async listSheets(options: { includeAll?: boolean } = {}): Promise<unknown> {
    const params = new URLSearchParams();
    if (options.includeAll) {
      params.set("includeAll", "true");
    }
    const query = params.toString();
    return this.request(`/sheets${query ? `?${query}` : ""}`);
  }

  async getSheet(
    sheetId: string,
    options: {
      includeAttachments?: boolean;
      includeDiscussions?: boolean;
    } = {}
  ): Promise<unknown> {
    const params = new URLSearchParams();
    const includes: string[] = [];
    if (options.includeAttachments) includes.push("attachments");
    if (options.includeDiscussions) includes.push("discussions");
    if (includes.length) params.set("include", includes.join(","));

    const query = params.toString();
    return this.request(`/sheets/${sheetId}${query ? `?${query}` : ""}`);
  }

  async createRow(
    sheetId: string,
    row: { cells: Array<{ columnId: string; value: unknown }> },
    options: { toTop?: boolean } = {}
  ): Promise<unknown> {
    return this.request(`/sheets/${sheetId}/rows`, {
      method: "POST",
      body: JSON.stringify({
        ...row,
        toTop: options.toTop,
      }),
    });
  }

  async updateRow(
    sheetId: string,
    row: { id: string; cells: Array<{ columnId: string; value: unknown }> }
  ): Promise<unknown> {
    return this.request(`/sheets/${sheetId}/rows`, {
      method: "PUT",
      body: JSON.stringify([row]),
    });
  }

  async deleteRow(sheetId: string, rowId: string): Promise<unknown> {
    return this.request(`/sheets/${sheetId}/rows/${rowId}`, {
      method: "DELETE",
    });
  }

  async searchSheets(query: string): Promise<unknown> {
    const params = new URLSearchParams();
    params.set("query", query);
    // Scope to sheets only for faster results
    params.set("scopes", "sheetNames");
    return this.request(`/search?${params.toString()}`);
  }
}

/**
 * Tool response helper
 */
function success(data: unknown) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

function error(message: string, details?: unknown) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ error: message, details }, null, 2),
      },
    ],
    isError: true,
  };
}

/**
 * Create the Smartsheet MCP server
 */
function createServer(apiKey: string): Server {
  const client = new SmartsheetClient(apiKey);

  const server = new Server(
    {
      name: "smartsheet",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );

  // List tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: smartsheetTools };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case "smartsheet_search_sheets": {
          const { query } = args as { query: string };
          const result = (await client.searchSheets(query)) as {
            results?: Array<{
              objectType: string;
              objectId: number;
              text: string;
              contextData?: Array<{ objectType: string; objectId: number; name: string }>;
            }>;
          };

          // Extract sheet information from search results
          const sheets: Array<{ id: string; name: string }> = [];
          if (result.results) {
            for (const item of result.results) {
              // Results include the sheet name in text and ID in objectId
              if (item.objectType === "sheet") {
                sheets.push({
                  id: String(item.objectId),
                  name: item.text,
                });
              }
              // Also check contextData for sheets found via other object types
              if (item.contextData) {
                for (const ctx of item.contextData) {
                  if (ctx.objectType === "sheet") {
                    sheets.push({
                      id: String(ctx.objectId),
                      name: ctx.name,
                    });
                  }
                }
              }
            }
          }

          // Deduplicate by ID
          const uniqueSheets = Array.from(
            new Map(sheets.map((s) => [s.id, s])).values()
          );

          return success({
            query,
            matchCount: uniqueSheets.length,
            sheets: uniqueSheets,
          });
        }

        case "smartsheet_list_sheets": {
          const result = await client.listSheets(args as { includeAll?: boolean });
          return success(result);
        }

        case "smartsheet_get_sheet": {
          const { sheetId, ...options } = args as {
            sheetId: string;
            includeAttachments?: boolean;
            includeDiscussions?: boolean;
          };
          const result = await client.getSheet(sheetId, options);
          return success(result);
        }

        case "smartsheet_search_rows": {
          const { sheetId, query, columnNames, exactMatch } = args as {
            sheetId: string;
            query: string;
            columnNames?: string[];
            exactMatch?: boolean;
          };

          // Get sheet data
          const sheet = (await client.getSheet(sheetId)) as {
            columns: Array<{ id: string; title: string }>;
            rows: Array<{
              id: string;
              rowNumber: number;
              cells: Array<{ columnId: string; value?: unknown; displayValue?: string }>;
            }>;
          };

          // Build column name to ID mapping
          const columnMap = new Map<string, string>();
          for (const col of sheet.columns) {
            columnMap.set(col.title.toLowerCase(), col.id);
          }

          // Filter columns to search
          const searchColumnIds = columnNames
            ? columnNames
                .map((name) => columnMap.get(name.toLowerCase()))
                .filter((id): id is string => id !== undefined)
            : Array.from(columnMap.values());

          // Search rows
          const matchingRows = sheet.rows.filter((row) => {
            for (const cell of row.cells) {
              if (!searchColumnIds.includes(cell.columnId)) continue;

              const cellValue = String(cell.displayValue || cell.value || "").toLowerCase();
              const searchQuery = query.toLowerCase();

              if (exactMatch) {
                if (cellValue === searchQuery) return true;
              } else {
                if (cellValue.includes(searchQuery)) return true;
              }
            }
            return false;
          });

          return success({
            sheetId,
            query,
            matchCount: matchingRows.length,
            rows: matchingRows,
          });
        }

        case "smartsheet_create_row": {
          const { sheetId, cells, toTop } = args as {
            sheetId: string;
            cells: Array<{ columnName: string; value: string }>;
            toTop?: boolean;
          };

          // Get column mapping
          const sheet = (await client.getSheet(sheetId)) as {
            columns: Array<{ id: string; title: string }>;
          };
          const columnMap = new Map<string, string>();
          for (const col of sheet.columns) {
            columnMap.set(col.title.toLowerCase(), col.id);
          }

          // Map cell column names to IDs
          const mappedCells = cells
            .map((cell) => ({
              columnId: columnMap.get(cell.columnName.toLowerCase()),
              value: cell.value,
            }))
            .filter((cell) => cell.columnId !== undefined);

          const result = await client.createRow(sheetId, { cells: mappedCells as Array<{ columnId: string; value: unknown }> }, { toTop });
          return success(result);
        }

        case "smartsheet_update_row": {
          const { sheetId, rowId, cells } = args as {
            sheetId: string;
            rowId: string;
            cells: Array<{ columnName: string; value: string }>;
          };

          // Get column mapping
          const sheet = (await client.getSheet(sheetId)) as {
            columns: Array<{ id: string; title: string }>;
          };
          const columnMap = new Map<string, string>();
          for (const col of sheet.columns) {
            columnMap.set(col.title.toLowerCase(), col.id);
          }

          // Map cell column names to IDs
          const mappedCells = cells
            .map((cell) => ({
              columnId: columnMap.get(cell.columnName.toLowerCase()),
              value: cell.value,
            }))
            .filter((cell) => cell.columnId !== undefined);

          const result = await client.updateRow(sheetId, {
            id: rowId,
            cells: mappedCells as Array<{ columnId: string; value: unknown }>,
          });
          return success(result);
        }

        case "smartsheet_delete_row": {
          const { sheetId, rowId } = args as { sheetId: string; rowId: string };
          const result = await client.deleteRow(sheetId, rowId);
          return success(result);
        }

        case "smartsheet_get_summary": {
          const { sheetId } = args as { sheetId: string };
          const sheet = (await client.getSheet(sheetId)) as {
            name: string;
            columns: Array<{ id: string; title: string; type: string }>;
            rows: Array<unknown>;
            createdAt: string;
            modifiedAt: string;
          };

          return success({
            name: sheet.name,
            columnCount: sheet.columns.length,
            rowCount: sheet.rows.length,
            columns: sheet.columns.map((col) => ({
              name: col.title,
              type: col.type,
            })),
            createdAt: sheet.createdAt,
            modifiedAt: sheet.modifiedAt,
          });
        }

        default:
          return error(`Unknown tool: ${name}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return error(message);
    }
  });

  // List resources (sheets as resources)
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    try {
      const result = (await client.listSheets()) as {
        data: Array<{ id: string; name: string }>;
      };

      const resources = result.data.map((sheet) => ({
        uri: `smartsheet://sheets/${sheet.id}`,
        name: sheet.name,
        description: `Smartsheet: ${sheet.name}`,
        mimeType: "application/json",
      }));

      return { resources };
    } catch {
      return { resources: [] };
    }
  });

  // Read resource
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    const match = uri.match(/^smartsheet:\/\/sheets\/(\d+)$/);
    if (!match) {
      throw new Error(`Invalid resource URI: ${uri}`);
    }

    const sheetId = match[1];
    const sheet = await client.getSheet(sheetId);

    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(sheet, null, 2),
        },
      ],
    };
  });

  return server;
}

/**
 * Main entry point
 */
async function main() {
  const apiKey = process.env.SMARTSHEET_API_KEY;

  if (!apiKey) {
    console.error("SMARTSHEET_API_KEY environment variable is required");
    process.exit(1);
  }

  const server = createServer(apiKey);
  const transport = new StdioServerTransport();

  await server.connect(transport);

  console.error("Smartsheet MCP Server running on stdio");
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

export { createServer };
export default createServer;
