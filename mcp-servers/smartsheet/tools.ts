/**
 * Smartsheet MCP Tool Definitions
 *
 * Tools for interacting with Smartsheet project management platform.
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";

/**
 * List all accessible sheets
 */
export const listSheetsTool: Tool = {
  name: "smartsheet_list_sheets",
  description: "List all Smartsheet sheets accessible to the current user",
  inputSchema: {
    type: "object" as const,
    properties: {
      includeAll: {
        type: "boolean",
        default: false,
        description: "Include sheets from all workspaces",
      },
      modifiedSince: {
        type: "string",
        format: "date-time",
        description: "Only return sheets modified after this date",
      },
    },
  },
};

/**
 * Get sheet data with rows and columns
 */
export const getSheetTool: Tool = {
  name: "smartsheet_get_sheet",
  description:
    "Get full sheet data including columns, rows, and cell values. Use this to read project data from Smartsheet.",
  inputSchema: {
    type: "object" as const,
    properties: {
      sheetId: {
        type: "string",
        description: "The Smartsheet sheet ID",
      },
      includeAttachments: {
        type: "boolean",
        default: false,
        description: "Include attachment information",
      },
      includeDiscussions: {
        type: "boolean",
        default: false,
        description: "Include discussion threads",
      },
      rowNumbers: {
        type: "array",
        items: { type: "number" },
        description: "Specific row numbers to retrieve (optional, returns all if omitted)",
      },
    },
    required: ["sheetId"],
  },
};

/**
 * Search for rows matching criteria
 */
export const searchRowsTool: Tool = {
  name: "smartsheet_search_rows",
  description:
    "Search for rows in a sheet that match specific criteria. Useful for finding project data.",
  inputSchema: {
    type: "object" as const,
    properties: {
      sheetId: {
        type: "string",
        description: "The Smartsheet sheet ID to search",
      },
      query: {
        type: "string",
        description: "Text to search for in cell values",
      },
      columnNames: {
        type: "array",
        items: { type: "string" },
        description: "Limit search to specific column names (optional)",
      },
      exactMatch: {
        type: "boolean",
        default: false,
        description: "Require exact match instead of contains",
      },
    },
    required: ["sheetId", "query"],
  },
};

/**
 * Create a new row
 */
export const createRowTool: Tool = {
  name: "smartsheet_create_row",
  description: "Create a new row in a Smartsheet sheet with specified cell values",
  inputSchema: {
    type: "object" as const,
    properties: {
      sheetId: {
        type: "string",
        description: "The Smartsheet sheet ID",
      },
      cells: {
        type: "array",
        items: {
          type: "object",
          properties: {
            columnName: { type: "string" },
            value: { type: "string" },
          },
          required: ["columnName", "value"],
        },
        description: "Cell values to set, mapped by column name",
      },
      toTop: {
        type: "boolean",
        default: false,
        description: "Add row at top of sheet instead of bottom",
      },
      parentId: {
        type: "string",
        description: "Parent row ID for hierarchical sheets",
      },
    },
    required: ["sheetId", "cells"],
  },
};

/**
 * Update an existing row
 */
export const updateRowTool: Tool = {
  name: "smartsheet_update_row",
  description: "Update cell values in an existing Smartsheet row",
  inputSchema: {
    type: "object" as const,
    properties: {
      sheetId: {
        type: "string",
        description: "The Smartsheet sheet ID",
      },
      rowId: {
        type: "string",
        description: "The row ID to update",
      },
      cells: {
        type: "array",
        items: {
          type: "object",
          properties: {
            columnName: { type: "string" },
            value: { type: "string" },
          },
          required: ["columnName", "value"],
        },
        description: "Cell values to update, mapped by column name",
      },
    },
    required: ["sheetId", "rowId", "cells"],
  },
};

/**
 * Delete a row
 */
export const deleteRowTool: Tool = {
  name: "smartsheet_delete_row",
  description: "Delete a row from a Smartsheet sheet",
  inputSchema: {
    type: "object" as const,
    properties: {
      sheetId: {
        type: "string",
        description: "The Smartsheet sheet ID",
      },
      rowId: {
        type: "string",
        description: "The row ID to delete",
      },
    },
    required: ["sheetId", "rowId"],
  },
};

/**
 * Get sheet summary (for project overview)
 */
export const getSheetSummaryTool: Tool = {
  name: "smartsheet_get_summary",
  description:
    "Get a summary of a Smartsheet sheet including column names, row count, and metadata. Useful for understanding sheet structure before extracting data.",
  inputSchema: {
    type: "object" as const,
    properties: {
      sheetId: {
        type: "string",
        description: "The Smartsheet sheet ID",
      },
    },
    required: ["sheetId"],
  },
};

/**
 * All Smartsheet tools
 */
export const smartsheetTools: Tool[] = [
  listSheetsTool,
  getSheetTool,
  searchRowsTool,
  createRowTool,
  updateRowTool,
  deleteRowTool,
  getSheetSummaryTool,
];

export default smartsheetTools;
