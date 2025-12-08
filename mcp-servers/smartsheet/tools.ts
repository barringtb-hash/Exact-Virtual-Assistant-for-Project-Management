/**
 * Smartsheet MCP Tool Definitions
 *
 * Tools for interacting with Smartsheet project management platform.
 * Optimized for large sheets with pagination, column projection, and smart truncation.
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";

// ============================================================================
// Constants for Response Limiting
// ============================================================================

export const SMARTSHEET_LIMITS = {
  /** Maximum rows to return in a single response */
  MAX_ROWS_DEFAULT: 100,
  /** Maximum rows allowed per page */
  MAX_PAGE_SIZE: 500,
  /** Default page size for paginated requests */
  DEFAULT_PAGE_SIZE: 100,
  /** Maximum response size in KB before truncation warning */
  MAX_RESPONSE_SIZE_KB: 150,
  /** Maximum columns to return if not specified */
  MAX_COLUMNS_DEFAULT: 50,
};

// ============================================================================
// Search Tools (Lightweight - Preferred for Finding Data)
// ============================================================================

/**
 * Search for sheets by name - PREFERRED for finding sheets
 */
export const searchSheetsTool: Tool = {
  name: "smartsheet_search_sheets",
  description:
    "Search for Smartsheet sheets by name. Returns sheets whose names contain the search query. This is the PREFERRED way to find a sheet when you know its name (or part of it). Fast and lightweight.",
  inputSchema: {
    type: "object" as const,
    properties: {
      query: {
        type: "string",
        description: "Text to search for in sheet names",
      },
    },
    required: ["query"],
  },
};

/**
 * Search for rows matching criteria - server-side filtering
 */
export const searchRowsTool: Tool = {
  name: "smartsheet_search_rows",
  description:
    "Search for rows in a sheet that match specific criteria. Returns only matching rows with truncation for large results. For very large sheets, consider using smartsheet_get_rows_paginated instead.",
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
        description:
          "Limit search to specific column names (RECOMMENDED - improves performance)",
      },
      exactMatch: {
        type: "boolean",
        default: false,
        description: "Require exact match instead of contains",
      },
      maxResults: {
        type: "number",
        default: 50,
        description: "Maximum number of matching rows to return (default: 50)",
      },
    },
    required: ["sheetId", "query"],
  },
};

// ============================================================================
// Metadata Tools (No Row Data - Use First to Understand Structure)
// ============================================================================

/**
 * Get sheet summary - metadata only, no rows
 */
export const getSheetSummaryTool: Tool = {
  name: "smartsheet_get_summary",
  description:
    "Get a summary of a Smartsheet sheet including column names, row count, and metadata. Does NOT return row data - use this FIRST to understand sheet structure before fetching rows.",
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
 * Get columns only - no row data
 */
export const getColumnsTool: Tool = {
  name: "smartsheet_get_columns",
  description:
    "Get column definitions only, without any row data. Use this first to understand sheet structure and get column IDs for targeted queries. Very fast even for large sheets.",
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

// ============================================================================
// Paginated/Filtered Data Tools (For Large Sheets)
// ============================================================================

/**
 * Get sheet data with pagination - for large sheets
 */
export const getSheetPaginatedTool: Tool = {
  name: "smartsheet_get_rows_paginated",
  description:
    "Get sheet rows with pagination. REQUIRED for sheets with more than 100 rows. Returns a page of rows at a time with navigation info.",
  inputSchema: {
    type: "object" as const,
    properties: {
      sheetId: {
        type: "string",
        description: "The Smartsheet sheet ID",
      },
      page: {
        type: "number",
        default: 1,
        description: "Page number (1-based, default: 1)",
      },
      pageSize: {
        type: "number",
        default: 100,
        description: `Rows per page (default: 100, max: ${SMARTSHEET_LIMITS.MAX_PAGE_SIZE})`,
      },
      columns: {
        type: "array",
        items: { type: "string" },
        description:
          "Only return these columns by name (RECOMMENDED - reduces response size)",
      },
      sortColumn: {
        type: "string",
        description: "Column name to sort by",
      },
      sortDescending: {
        type: "boolean",
        default: false,
        description: "Sort in descending order",
      },
    },
    required: ["sheetId"],
  },
};

/**
 * Get a single row by ID - fastest for known rows
 */
export const getRowTool: Tool = {
  name: "smartsheet_get_row",
  description:
    "Get a single row by its ID. Much faster than loading entire sheet when you know the row ID. Use after searching to get full row details.",
  inputSchema: {
    type: "object" as const,
    properties: {
      sheetId: {
        type: "string",
        description: "The Smartsheet sheet ID",
      },
      rowId: {
        type: "string",
        description: "The row ID to retrieve",
      },
      columns: {
        type: "array",
        items: { type: "string" },
        description: "Only return these columns by name (optional)",
      },
    },
    required: ["sheetId", "rowId"],
  },
};

/**
 * Get specific rows by IDs - batch retrieval
 */
export const getRowsByIdsTool: Tool = {
  name: "smartsheet_get_rows_by_ids",
  description:
    "Get multiple specific rows by their IDs. More efficient than multiple single-row calls. Maximum 100 rows per request.",
  inputSchema: {
    type: "object" as const,
    properties: {
      sheetId: {
        type: "string",
        description: "The Smartsheet sheet ID",
      },
      rowIds: {
        type: "array",
        items: { type: "string" },
        description: "Array of row IDs to retrieve (max 100)",
      },
      columns: {
        type: "array",
        items: { type: "string" },
        description: "Only return these columns by name (optional)",
      },
    },
    required: ["sheetId", "rowIds"],
  },
};

// ============================================================================
// Full Sheet Tool (Use with Caution on Large Sheets)
// ============================================================================

/**
 * Get full sheet data - WARNING: may timeout on large sheets
 */
export const getSheetTool: Tool = {
  name: "smartsheet_get_sheet",
  description:
    "Get sheet data including columns and rows. WARNING: For sheets with >100 rows, use smartsheet_get_rows_paginated instead to avoid timeouts. This tool automatically truncates results for large sheets.",
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
        description: "Specific row numbers to retrieve (1-based, optional)",
      },
      rowIds: {
        type: "array",
        items: { type: "string" },
        description: "Specific row IDs to retrieve (optional)",
      },
      columns: {
        type: "array",
        items: { type: "string" },
        description: "Only return these columns by name (RECOMMENDED)",
      },
      maxRows: {
        type: "number",
        default: 100,
        description: `Maximum rows to return (default: ${SMARTSHEET_LIMITS.MAX_ROWS_DEFAULT})`,
      },
    },
    required: ["sheetId"],
  },
};

/**
 * List all accessible sheets
 */
export const listSheetsTool: Tool = {
  name: "smartsheet_list_sheets",
  description:
    "List all Smartsheet sheets accessible to the current user. Returns sheet names and IDs. Note: Use smartsheet_search_sheets instead if looking for a specific sheet by name.",
  inputSchema: {
    type: "object" as const,
    properties: {
      includeAll: {
        type: "boolean",
        default: false,
        description: "Include sheets from all workspaces",
      },
      pageSize: {
        type: "number",
        default: 100,
        description: "Number of sheets per page (default: 100)",
      },
      page: {
        type: "number",
        default: 1,
        description: "Page number (1-based)",
      },
    },
  },
};

// ============================================================================
// Write Operations
// ============================================================================

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

// ============================================================================
// Export All Tools
// ============================================================================

/**
 * All Smartsheet tools - ordered by recommended usage
 */
export const smartsheetTools: Tool[] = [
  // Search tools (lightweight, preferred)
  searchSheetsTool,
  searchRowsTool,
  // Metadata tools (no row data, use first)
  getSheetSummaryTool,
  getColumnsTool,
  // Paginated/targeted data tools (for large sheets)
  getSheetPaginatedTool,
  getRowTool,
  getRowsByIdsTool,
  // Full sheet tool (use with caution)
  getSheetTool,
  listSheetsTool,
  // Write operations
  createRowTool,
  updateRowTool,
  deleteRowTool,
];

export default smartsheetTools;
