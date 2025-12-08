/**
 * Smartsheet MCP Server
 *
 * Provides MCP tools for interacting with Smartsheet project management platform.
 * Optimized for large sheets with pagination, column projection, and smart truncation.
 *
 * Key optimizations:
 * - Response truncation with hints for large datasets
 * - Column projection to reduce payload size
 * - Pagination for sheets with many rows
 * - Metadata-only endpoints for structure discovery
 * - Caching for column mappings
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { smartsheetTools, SMARTSHEET_LIMITS } from "./tools.js";

const SMARTSHEET_API_BASE = "https://api.smartsheet.com/2.0";

// ============================================================================
// Types
// ============================================================================

interface SheetColumn {
  id: string;
  title: string;
  type: string;
  index?: number;
}

interface SheetCell {
  columnId: string;
  value?: unknown;
  displayValue?: string;
}

interface SheetRow {
  id: string;
  rowNumber: number;
  cells: SheetCell[];
  parentId?: string;
  createdAt?: string;
  modifiedAt?: string;
}

interface SheetData {
  id: string;
  name: string;
  columns: SheetColumn[];
  rows: SheetRow[];
  totalRowCount?: number;
  createdAt?: string;
  modifiedAt?: string;
}

interface TruncationInfo {
  truncated: boolean;
  totalRows: number;
  returnedRows: number;
  hint?: string;
  hasMorePages?: boolean;
  currentPage?: number;
  totalPages?: number;
}

interface ResponseSizeInfo {
  estimatedSizeKB: number;
  warning?: string;
}

// ============================================================================
// Security: Error Sanitization (MED-06)
// ============================================================================

/**
 * MED-06: Sanitize Smartsheet API error messages
 * Returns a generic error message to avoid leaking sensitive details
 */
function sanitizeSmartsheetError(status: number, _errorBody: string): string {
  const statusMessages: Record<number, string> = {
    400: "Invalid request to Smartsheet API",
    401: "Smartsheet authentication failed",
    403: "Access denied to Smartsheet resource",
    404: "Smartsheet resource not found",
    429: "Smartsheet rate limit exceeded - please wait and retry",
    500: "Smartsheet service error",
    502: "Smartsheet bad gateway",
    503: "Smartsheet service unavailable",
  };

  return statusMessages[status] || `Smartsheet API error (${status})`;
}

// ============================================================================
// Response Utilities
// ============================================================================

/**
 * Estimate JSON response size in KB
 */
function estimateResponseSize(data: unknown): number {
  const jsonString = JSON.stringify(data);
  return Math.round(jsonString.length / 1024);
}

/**
 * Check if response size exceeds threshold and add warning
 */
function checkResponseSize(data: unknown): ResponseSizeInfo {
  const sizeKB = estimateResponseSize(data);
  const info: ResponseSizeInfo = { estimatedSizeKB: sizeKB };

  if (sizeKB > SMARTSHEET_LIMITS.MAX_RESPONSE_SIZE_KB) {
    info.warning = `Response size (${sizeKB}KB) exceeds recommended limit (${SMARTSHEET_LIMITS.MAX_RESPONSE_SIZE_KB}KB). Consider using pagination or column filtering.`;
  }

  return info;
}

/**
 * Truncate rows array with pagination info
 */
function truncateRows(
  rows: SheetRow[],
  maxRows: number,
  page?: number,
  pageSize?: number
): { rows: SheetRow[]; truncation: TruncationInfo } {
  const totalRows = rows.length;

  if (page !== undefined && pageSize !== undefined) {
    // Pagination mode
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const pagedRows = rows.slice(startIndex, endIndex);
    const totalPages = Math.ceil(totalRows / pageSize);

    return {
      rows: pagedRows,
      truncation: {
        truncated: totalRows > pageSize,
        totalRows,
        returnedRows: pagedRows.length,
        currentPage: page,
        totalPages,
        hasMorePages: page < totalPages,
        hint:
          page < totalPages
            ? `Page ${page} of ${totalPages}. Use page=${page + 1} for next page.`
            : undefined,
      },
    };
  }

  // Simple truncation mode
  if (totalRows <= maxRows) {
    return {
      rows,
      truncation: {
        truncated: false,
        totalRows,
        returnedRows: totalRows,
      },
    };
  }

  return {
    rows: rows.slice(0, maxRows),
    truncation: {
      truncated: true,
      totalRows,
      returnedRows: maxRows,
      hint: `Showing first ${maxRows} of ${totalRows} rows. Use smartsheet_get_rows_paginated for full access, or add filters to narrow results.`,
    },
  };
}

/**
 * Filter columns by name and return only matching column IDs
 */
function filterColumnIds(
  columns: SheetColumn[],
  columnNames?: string[]
): Set<string> {
  if (!columnNames || columnNames.length === 0) {
    return new Set(columns.map((c) => c.id));
  }

  const columnMap = new Map<string, string>();
  for (const col of columns) {
    columnMap.set(col.title.toLowerCase(), col.id);
  }

  const filteredIds = new Set<string>();
  for (const name of columnNames) {
    const id = columnMap.get(name.toLowerCase());
    if (id) {
      filteredIds.add(id);
    }
  }

  return filteredIds;
}

/**
 * Project row cells to only include specified columns
 */
function projectRowColumns(
  row: SheetRow,
  columnIds: Set<string>
): SheetRow {
  return {
    ...row,
    cells: row.cells.filter((cell) => columnIds.has(cell.columnId)),
  };
}

/**
 * Transform row cells to include column names for readability
 */
function enrichRowWithColumnNames(
  row: SheetRow,
  columnMap: Map<string, string>
): Record<string, unknown> & { _rowId: string; _rowNumber: number } {
  const enrichedRow: Record<string, unknown> & { _rowId: string; _rowNumber: number } = {
    _rowId: row.id,
    _rowNumber: row.rowNumber,
  };

  for (const cell of row.cells) {
    const columnName = columnMap.get(cell.columnId);
    if (columnName) {
      enrichedRow[columnName] = cell.displayValue ?? cell.value ?? null;
    }
  }

  return enrichedRow;
}

// ============================================================================
// Smartsheet API Client
// ============================================================================

/**
 * Smartsheet API client with caching for column mappings
 */
class SmartsheetClient {
  private apiKey: string;
  private columnCache: Map<string, { columns: SheetColumn[]; timestamp: number }> = new Map();
  private static CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

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
      const errorBody = await response.text();
      throw new Error(sanitizeSmartsheetError(response.status, errorBody));
    }

    return response.json();
  }

  /**
   * List sheets with pagination support
   */
  async listSheets(options: {
    includeAll?: boolean;
    page?: number;
    pageSize?: number;
  } = {}): Promise<unknown> {
    const params = new URLSearchParams();
    if (options.includeAll) params.set("includeAll", "true");
    if (options.page) params.set("page", String(options.page));
    if (options.pageSize) params.set("pageSize", String(options.pageSize));

    const query = params.toString();
    return this.request(`/sheets${query ? `?${query}` : ""}`);
  }

  /**
   * Get sheet with optional row/column filtering
   */
  async getSheet(
    sheetId: string,
    options: {
      includeAttachments?: boolean;
      includeDiscussions?: boolean;
      rowIds?: string[];
      columnIds?: string[];
      pageSize?: number;
      page?: number;
    } = {}
  ): Promise<unknown> {
    const params = new URLSearchParams();
    const includes: string[] = [];

    if (options.includeAttachments) includes.push("attachments");
    if (options.includeDiscussions) includes.push("discussions");
    if (includes.length) params.set("include", includes.join(","));

    // Smartsheet API supports rowIds filter
    if (options.rowIds && options.rowIds.length > 0) {
      params.set("rowIds", options.rowIds.join(","));
    }

    // Smartsheet API supports columnIds filter
    if (options.columnIds && options.columnIds.length > 0) {
      params.set("columnIds", options.columnIds.join(","));
    }

    // Pagination parameters
    if (options.pageSize) params.set("pageSize", String(options.pageSize));
    if (options.page) params.set("page", String(options.page));

    const query = params.toString();
    return this.request(`/sheets/${sheetId}${query ? `?${query}` : ""}`);
  }

  /**
   * Get columns only (cached)
   */
  async getColumns(sheetId: string): Promise<SheetColumn[]> {
    const cached = this.columnCache.get(sheetId);
    const now = Date.now();

    if (cached && now - cached.timestamp < SmartsheetClient.CACHE_TTL_MS) {
      return cached.columns;
    }

    const result = (await this.request(`/sheets/${sheetId}/columns`)) as {
      data: SheetColumn[];
    };

    this.columnCache.set(sheetId, {
      columns: result.data,
      timestamp: now,
    });

    return result.data;
  }

  /**
   * Get a single row by ID
   */
  async getRow(
    sheetId: string,
    rowId: string,
    options: { include?: string[] } = {}
  ): Promise<unknown> {
    const params = new URLSearchParams();
    if (options.include && options.include.length > 0) {
      params.set("include", options.include.join(","));
    }

    const query = params.toString();
    return this.request(`/sheets/${sheetId}/rows/${rowId}${query ? `?${query}` : ""}`);
  }

  /**
   * Create a new row
   */
  async createRow(
    sheetId: string,
    row: { cells: Array<{ columnId: string; value: unknown }> },
    options: { toTop?: boolean; parentId?: string } = {}
  ): Promise<unknown> {
    const body: Record<string, unknown> = { ...row };
    if (options.toTop) body.toTop = true;
    if (options.parentId) body.parentId = options.parentId;

    return this.request(`/sheets/${sheetId}/rows`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /**
   * Update an existing row
   */
  async updateRow(
    sheetId: string,
    row: { id: string; cells: Array<{ columnId: string; value: unknown }> }
  ): Promise<unknown> {
    return this.request(`/sheets/${sheetId}/rows`, {
      method: "PUT",
      body: JSON.stringify([row]),
    });
  }

  /**
   * Delete a row
   */
  async deleteRow(sheetId: string, rowId: string): Promise<unknown> {
    return this.request(`/sheets/${sheetId}/rows/${rowId}`, {
      method: "DELETE",
    });
  }

  /**
   * Search sheets by name
   */
  async searchSheets(query: string): Promise<unknown> {
    const params = new URLSearchParams();
    params.set("query", query);
    params.set("scopes", "sheetNames");
    return this.request(`/search?${params.toString()}`);
  }

  /**
   * Search within a sheet (uses Smartsheet's search API)
   */
  async searchInSheet(sheetId: string, query: string): Promise<unknown> {
    const params = new URLSearchParams();
    params.set("query", query);
    return this.request(`/search/sheets/${sheetId}?${params.toString()}`);
  }

  /**
   * Build column name to ID mapping
   */
  async getColumnMap(sheetId: string): Promise<Map<string, string>> {
    const columns = await this.getColumns(sheetId);
    const map = new Map<string, string>();
    for (const col of columns) {
      map.set(col.title.toLowerCase(), col.id);
    }
    return map;
  }

  /**
   * Build column ID to name mapping (reverse)
   */
  async getColumnIdToNameMap(sheetId: string): Promise<Map<string, string>> {
    const columns = await this.getColumns(sheetId);
    const map = new Map<string, string>();
    for (const col of columns) {
      map.set(col.id, col.title);
    }
    return map;
  }
}

// ============================================================================
// Fuzzy Search Helpers
// ============================================================================

/**
 * Extract meaningful keywords from a search query
 * Removes common words and returns significant terms
 */
function extractKeywords(query: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
    'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
    'project', 'plan', 'sheet', 'data', 'info', 'information'
  ]);

  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length >= 2 && !stopWords.has(word));
}

/**
 * Calculate similarity score between two strings (0-1)
 * Uses a combination of substring matching and word overlap
 */
function calculateSimilarity(query: string, target: string): number {
  const queryLower = query.toLowerCase();
  const targetLower = target.toLowerCase();

  // Exact match
  if (queryLower === targetLower) return 1.0;

  // Contains full query
  if (targetLower.includes(queryLower)) return 0.9;

  // Query contains target
  if (queryLower.includes(targetLower)) return 0.85;

  // Word-based matching
  const queryWords = extractKeywords(query);
  const targetWords = new Set(extractKeywords(target));

  if (queryWords.length === 0) return 0;

  let matchScore = 0;
  for (const word of queryWords) {
    // Check for exact word match
    if (targetWords.has(word)) {
      matchScore += 1;
    } else {
      // Check for partial word match (word starts with or is contained)
      for (const targetWord of targetWords) {
        if (targetWord.startsWith(word) || word.startsWith(targetWord)) {
          matchScore += 0.7;
          break;
        }
        if (targetWord.includes(word) || word.includes(targetWord)) {
          matchScore += 0.5;
          break;
        }
      }
    }
  }

  return matchScore / queryWords.length;
}

/**
 * Find best matching sheets from a list using fuzzy matching
 */
function findBestMatches(
  query: string,
  sheets: Array<{ id: string; name: string }>,
  minScore: number = 0.3
): Array<{ id: string; name: string; score: number }> {
  const scored = sheets
    .map(sheet => ({
      ...sheet,
      score: calculateSimilarity(query, sheet.name)
    }))
    .filter(s => s.score >= minScore)
    .sort((a, b) => b.score - a.score);

  return scored;
}

// ============================================================================
// Tool Response Helpers
// ============================================================================

function success(data: unknown) {
  const sizeInfo = checkResponseSize(data);

  const response: Record<string, unknown> = {
    ...((typeof data === "object" && data !== null) ? data : { data }),
  };

  // Add size warning if needed
  if (sizeInfo.warning) {
    response._responseInfo = {
      estimatedSizeKB: sizeInfo.estimatedSizeKB,
      warning: sizeInfo.warning,
    };
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(response, null, 2),
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

// ============================================================================
// Server Implementation
// ============================================================================

/**
 * Create the Smartsheet MCP server
 */
function createServer(apiKey: string): Server {
  const client = new SmartsheetClient(apiKey);

  const server = new Server(
    {
      name: "smartsheet",
      version: "2.0.0",
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
        // ================================================================
        // Convenience Tools (Combine Search + Fetch - RECOMMENDED)
        // ================================================================

        case "smartsheet_get_by_name": {
          const { name: sheetName, exactMatch } = args as {
            name: string;
            exactMatch?: boolean;
          };

          // Helper to collect sheets from search results
          const collectSheetsFromSearch = (searchResult: {
            results?: Array<{
              objectType: string;
              objectId: number;
              text: string;
              contextData?: Array<{ objectType: string; objectId: number; name: string }>;
            }>;
          }): Array<{ id: string; name: string }> => {
            const sheets: Array<{ id: string; name: string }> = [];
            if (searchResult.results) {
              for (const item of searchResult.results) {
                if (item.objectType === "sheet") {
                  sheets.push({
                    id: String(item.objectId),
                    name: item.text,
                  });
                }
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
            return sheets;
          };

          let sheets: Array<{ id: string; name: string }> = [];
          let searchStrategy = "direct";

          // Strategy 1: Direct search with full name
          const searchResult = (await client.searchSheets(sheetName)) as {
            results?: Array<{
              objectType: string;
              objectId: number;
              text: string;
              contextData?: Array<{ objectType: string; objectId: number; name: string }>;
            }>;
          };
          sheets = collectSheetsFromSearch(searchResult);

          // Strategy 2: If no results, try searching for individual keywords
          if (sheets.length === 0) {
            searchStrategy = "keyword";
            const keywords = extractKeywords(sheetName);

            // Search for the most distinctive keywords (longer words first)
            const sortedKeywords = [...keywords].sort((a, b) => b.length - a.length).slice(0, 3);

            for (const keyword of sortedKeywords) {
              if (keyword.length >= 3) {
                const keywordResult = (await client.searchSheets(keyword)) as {
                  results?: Array<{
                    objectType: string;
                    objectId: number;
                    text: string;
                    contextData?: Array<{ objectType: string; objectId: number; name: string }>;
                  }>;
                };
                sheets.push(...collectSheetsFromSearch(keywordResult));
              }
            }
          }

          // Strategy 3: If still no results, list all sheets and fuzzy match
          if (sheets.length === 0) {
            searchStrategy = "fuzzy";
            const listResult = (await client.listSheets({ pageSize: 100 })) as {
              data: Array<{ id: string; name: string }>;
            };

            if (listResult.data) {
              sheets = listResult.data.map(s => ({
                id: String(s.id),
                name: s.name
              }));
            }
          }

          // Dedupe sheets
          const uniqueSheets = Array.from(
            new Map(sheets.map((s) => [s.id, s])).values()
          );

          // Apply fuzzy matching to rank results
          let rankedSheets: Array<{ id: string; name: string; score: number }>;

          if (exactMatch) {
            rankedSheets = uniqueSheets
              .filter((s) => s.name.toLowerCase() === sheetName.toLowerCase())
              .map(s => ({ ...s, score: 1.0 }));
          } else {
            rankedSheets = findBestMatches(sheetName, uniqueSheets, 0.2);
          }

          if (rankedSheets.length === 0) {
            // Return top suggestions even with low scores
            const suggestions = findBestMatches(sheetName, uniqueSheets, 0.1).slice(0, 5);

            return success({
              searchQuery: sheetName,
              found: false,
              matchCount: 0,
              sheets: [],
              searchStrategy,
              suggestions: suggestions.length > 0 ? suggestions.map(s => ({
                name: s.name,
                id: s.id,
                matchScore: Math.round(s.score * 100) + "%"
              })) : undefined,
              hint: suggestions.length > 0
                ? `No exact match found for "${sheetName}". Did you mean one of these sheets?`
                : `No sheets found matching "${sheetName}". Use smartsheet_list_sheets to see all available sheets.`,
            });
          }

          // If exactly one high-confidence match (score > 0.7), get its summary
          const bestMatch = rankedSheets[0];
          if (rankedSheets.length === 1 || bestMatch.score > 0.7) {
            const sheet = bestMatch;
            const columns = await client.getColumns(sheet.id);
            const sheetData = (await client.getSheet(sheet.id, {
              pageSize: 1,
            })) as SheetData & { totalRowCount?: number };

            return success({
              searchQuery: sheetName,
              found: true,
              matchCount: 1,
              matchScore: Math.round(sheet.score * 100) + "%",
              searchStrategy,
              sheet: {
                sheetId: sheet.id,
                name: sheet.name,
                rowCount: sheetData.totalRowCount || sheetData.rows?.length || 0,
                columnCount: columns.length,
                columns: columns.map((col) => ({
                  id: col.id,
                  name: col.title,
                  type: col.type,
                })),
                createdAt: sheetData.createdAt,
                modifiedAt: sheetData.modifiedAt,
              },
              hint: `Use sheetId "${sheet.id}" for all subsequent operations on this sheet.`,
            });
          }

          // Multiple matches - return ranked list
          return success({
            searchQuery: sheetName,
            found: true,
            matchCount: rankedSheets.length,
            searchStrategy,
            sheets: rankedSheets.slice(0, 10).map(s => ({
              id: s.id,
              name: s.name,
              matchScore: Math.round(s.score * 100) + "%"
            })),
            hint: `Found ${rankedSheets.length} sheets matching "${sheetName}". The best match is "${bestMatch.name}" (${Math.round(bestMatch.score * 100)}% match).`,
          });
        }

        case "smartsheet_find_and_get_rows": {
          const {
            sheetName,
            columns,
            searchQuery,
            searchColumns,
            maxRows,
            page,
          } = args as {
            sheetName: string;
            columns?: string[];
            searchQuery?: string;
            searchColumns?: string[];
            maxRows?: number;
            page?: number;
          };

          // Helper to collect sheets from search results
          const collectSheetsFromSearch = (searchResultData: {
            results?: Array<{
              objectType: string;
              objectId: number;
              text: string;
              contextData?: Array<{ objectType: string; objectId: number; name: string }>;
            }>;
          }): Array<{ id: string; name: string }> => {
            const sheetsFound: Array<{ id: string; name: string }> = [];
            if (searchResultData.results) {
              for (const item of searchResultData.results) {
                if (item.objectType === "sheet") {
                  sheetsFound.push({
                    id: String(item.objectId),
                    name: item.text,
                  });
                }
                if (item.contextData) {
                  for (const ctx of item.contextData) {
                    if (ctx.objectType === "sheet") {
                      sheetsFound.push({
                        id: String(ctx.objectId),
                        name: ctx.name,
                      });
                    }
                  }
                }
              }
            }
            return sheetsFound;
          };

          let sheets: Array<{ id: string; name: string }> = [];

          // Strategy 1: Direct search with full name
          const searchResult = (await client.searchSheets(sheetName)) as {
            results?: Array<{
              objectType: string;
              objectId: number;
              text: string;
              contextData?: Array<{ objectType: string; objectId: number; name: string }>;
            }>;
          };
          sheets = collectSheetsFromSearch(searchResult);

          // Strategy 2: If no results, try searching for individual keywords
          if (sheets.length === 0) {
            const keywords = extractKeywords(sheetName);
            const sortedKeywords = [...keywords].sort((a, b) => b.length - a.length).slice(0, 3);

            for (const keyword of sortedKeywords) {
              if (keyword.length >= 3) {
                const keywordResult = (await client.searchSheets(keyword)) as {
                  results?: Array<{
                    objectType: string;
                    objectId: number;
                    text: string;
                    contextData?: Array<{ objectType: string; objectId: number; name: string }>;
                  }>;
                };
                sheets.push(...collectSheetsFromSearch(keywordResult));
              }
            }
          }

          // Strategy 3: If still no results, list all sheets and fuzzy match
          if (sheets.length === 0) {
            const listResult = (await client.listSheets({ pageSize: 100 })) as {
              data: Array<{ id: string; name: string }>;
            };

            if (listResult.data) {
              sheets = listResult.data.map(s => ({
                id: String(s.id),
                name: s.name
              }));
            }
          }

          // Dedupe sheets
          const uniqueSheets = Array.from(
            new Map(sheets.map((s) => [s.id, s])).values()
          );

          // Apply fuzzy matching to find best match
          const rankedSheets = findBestMatches(sheetName, uniqueSheets, 0.2);

          if (rankedSheets.length === 0) {
            const suggestions = findBestMatches(sheetName, uniqueSheets, 0.1).slice(0, 5);

            return success({
              searchQuery: sheetName,
              found: false,
              error: `No sheets found matching "${sheetName}"`,
              suggestions: suggestions.length > 0 ? suggestions.map(s => ({
                name: s.name,
                id: s.id,
                matchScore: Math.round(s.score * 100) + "%"
              })) : undefined,
              hint: suggestions.length > 0
                ? "Did you mean one of these sheets?"
                : "Use smartsheet_list_sheets to see all available sheets.",
            });
          }

          // Use the best match if it's high confidence, otherwise show options
          const bestMatch = rankedSheets[0];
          let targetSheet: { id: string; name: string };

          if (rankedSheets.length > 1 && bestMatch.score < 0.7) {
            // Multiple matches with no clear winner - ask user to clarify
            return success({
              searchQuery: sheetName,
              found: true,
              matchCount: rankedSheets.length,
              sheets: rankedSheets.slice(0, 5).map(s => ({
                id: s.id,
                name: s.name,
                matchScore: Math.round(s.score * 100) + "%"
              })),
              error: "Multiple sheets found. Please specify the exact sheet name.",
              hint: `Best match: "${bestMatch.name}" (${Math.round(bestMatch.score * 100)}% confidence). Use the exact name for better results.`,
            });
          }

          targetSheet = bestMatch;
          const sheetId = targetSheet.id;

          // Get column mapping
          const allColumns = await client.getColumns(sheetId);
          const columnIdToName = new Map<string, string>();
          const columnNameToId = new Map<string, string>();
          for (const col of allColumns) {
            columnIdToName.set(col.id, col.title);
            columnNameToId.set(col.title.toLowerCase(), col.id);
          }

          // Build column filter
          const columnIds = columns
            ? columns
                .map((name) => columnNameToId.get(name.toLowerCase()))
                .filter((id): id is string => id !== undefined)
            : undefined;

          // Fetch sheet data
          const sheetData = (await client.getSheet(sheetId, {
            columnIds,
          })) as SheetData;

          let rows = sheetData.rows;

          // Apply text search filter if provided
          if (searchQuery) {
            const searchColumnIds = searchColumns
              ? searchColumns
                  .map((name) => columnNameToId.get(name.toLowerCase()))
                  .filter((id): id is string => id !== undefined)
              : Array.from(columnNameToId.values());

            const searchLower = searchQuery.toLowerCase();
            rows = rows.filter((row) => {
              for (const cell of row.cells) {
                if (!searchColumnIds.includes(cell.columnId)) continue;
                const cellValue = String(cell.displayValue || cell.value || "").toLowerCase();
                if (cellValue.includes(searchLower)) {
                  return true;
                }
              }
              return false;
            });
          }

          // Apply pagination
          const effectiveMaxRows = maxRows || 50;
          const effectivePage = page || 1;
          const { rows: pagedRows, truncation } = truncateRows(
            rows,
            effectiveMaxRows,
            effectivePage,
            effectiveMaxRows
          );

          // Enrich rows with column names
          const enrichedRows = pagedRows.map((row) =>
            enrichRowWithColumnNames(row, columnIdToName)
          );

          return success({
            sheetId,
            sheetName: targetSheet.name,
            searchQuery: searchQuery || null,
            pagination: {
              page: effectivePage,
              pageSize: effectiveMaxRows,
              totalRows: truncation.totalRows,
              totalPages: truncation.totalPages,
              hasNextPage: truncation.hasMorePages,
            },
            columnCount: columns ? columns.length : allColumns.length,
            returnedRows: enrichedRows.length,
            rows: enrichedRows,
            hint: `Sheet ID "${sheetId}" can be used for subsequent operations.`,
          });
        }

        // ================================================================
        // Search Tools (Lightweight)
        // ================================================================

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

          const sheets: Array<{ id: string; name: string }> = [];
          if (result.results) {
            for (const item of result.results) {
              if (item.objectType === "sheet") {
                sheets.push({
                  id: String(item.objectId),
                  name: item.text,
                });
              }
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

          const uniqueSheets = Array.from(
            new Map(sheets.map((s) => [s.id, s])).values()
          );

          return success({
            query,
            matchCount: uniqueSheets.length,
            sheets: uniqueSheets,
          });
        }

        case "smartsheet_search_rows": {
          const { sheetId, query, columnNames, exactMatch, maxResults } = args as {
            sheetId: string;
            query: string;
            columnNames?: string[];
            exactMatch?: boolean;
            maxResults?: number;
          };

          const limit = Math.min(maxResults || 50, SMARTSHEET_LIMITS.MAX_ROWS_DEFAULT);

          // Get columns first (cached)
          const columns = await client.getColumns(sheetId);
          const columnIdToName = new Map<string, string>();
          const columnNameToId = new Map<string, string>();
          for (const col of columns) {
            columnIdToName.set(col.id, col.title);
            columnNameToId.set(col.title.toLowerCase(), col.id);
          }

          // Get sheet data
          const sheet = (await client.getSheet(sheetId)) as SheetData;

          // Filter columns to search
          const searchColumnIds = columnNames
            ? columnNames
                .map((name) => columnNameToId.get(name.toLowerCase()))
                .filter((id): id is string => id !== undefined)
            : Array.from(columnNameToId.values());

          // Search rows
          const matchingRows: Array<Record<string, unknown> & { _rowId: string; _rowNumber: number }> = [];
          const searchQuery = query.toLowerCase();

          for (const row of sheet.rows) {
            if (matchingRows.length >= limit) break;

            let matched = false;
            for (const cell of row.cells) {
              if (!searchColumnIds.includes(cell.columnId)) continue;

              const cellValue = String(cell.displayValue || cell.value || "").toLowerCase();

              if (exactMatch) {
                if (cellValue === searchQuery) {
                  matched = true;
                  break;
                }
              } else {
                if (cellValue.includes(searchQuery)) {
                  matched = true;
                  break;
                }
              }
            }

            if (matched) {
              matchingRows.push(enrichRowWithColumnNames(row, columnIdToName));
            }
          }

          const totalMatches = sheet.rows.filter((row) => {
            for (const cell of row.cells) {
              if (!searchColumnIds.includes(cell.columnId)) continue;
              const cellValue = String(cell.displayValue || cell.value || "").toLowerCase();
              if (exactMatch) {
                if (cellValue === searchQuery) return true;
              } else {
                if (cellValue.includes(searchQuery)) return true;
              }
            }
            return false;
          }).length;

          return success({
            sheetId,
            sheetName: sheet.name,
            query,
            matchCount: totalMatches,
            returnedCount: matchingRows.length,
            truncated: totalMatches > limit,
            hint: totalMatches > limit
              ? `Showing first ${limit} of ${totalMatches} matches. Use maxResults to increase limit or add columnNames filter.`
              : undefined,
            rows: matchingRows,
          });
        }

        // ================================================================
        // Metadata Tools (No Row Data)
        // ================================================================

        case "smartsheet_get_summary": {
          const { sheetId } = args as { sheetId: string };

          // Get sheet with minimal data (just structure)
          const sheet = (await client.getSheet(sheetId, {
            pageSize: 1, // Minimize row data
          })) as SheetData & { totalRowCount?: number };

          // Get accurate row count from a separate call if needed
          const columns = await client.getColumns(sheetId);

          return success({
            sheetId,
            name: sheet.name,
            columnCount: columns.length,
            rowCount: sheet.totalRowCount || sheet.rows?.length || 0,
            columns: columns.map((col) => ({
              id: col.id,
              name: col.title,
              type: col.type,
            })),
            createdAt: sheet.createdAt,
            modifiedAt: sheet.modifiedAt,
            hint: "Use smartsheet_get_rows_paginated to fetch row data, or smartsheet_search_rows to find specific rows.",
          });
        }

        case "smartsheet_get_columns": {
          const { sheetId } = args as { sheetId: string };
          const columns = await client.getColumns(sheetId);

          return success({
            sheetId,
            columnCount: columns.length,
            columns: columns.map((col) => ({
              id: col.id,
              name: col.title,
              type: col.type,
              index: col.index,
            })),
          });
        }

        // ================================================================
        // Paginated/Filtered Data Tools
        // ================================================================

        case "smartsheet_get_rows_paginated": {
          const { sheetId, page, pageSize, columns, sortColumn, sortDescending } = args as {
            sheetId: string;
            page?: number;
            pageSize?: number;
            columns?: string[];
            sortColumn?: string;
            sortDescending?: boolean;
          };

          const effectivePage = page || 1;
          const effectivePageSize = Math.min(
            pageSize || SMARTSHEET_LIMITS.DEFAULT_PAGE_SIZE,
            SMARTSHEET_LIMITS.MAX_PAGE_SIZE
          );

          // Get column mapping
          const allColumns = await client.getColumns(sheetId);
          const columnIdToName = new Map<string, string>();
          const columnNameToId = new Map<string, string>();
          for (const col of allColumns) {
            columnIdToName.set(col.id, col.title);
            columnNameToId.set(col.title.toLowerCase(), col.id);
          }

          // Build column filter if specified
          const columnIds = columns
            ? columns
                .map((name) => columnNameToId.get(name.toLowerCase()))
                .filter((id): id is string => id !== undefined)
            : undefined;

          // Fetch sheet data
          const sheet = (await client.getSheet(sheetId, {
            columnIds,
          })) as SheetData;

          // Sort if requested
          let rows = sheet.rows;
          if (sortColumn) {
            const sortColumnId = columnNameToId.get(sortColumn.toLowerCase());
            if (sortColumnId) {
              rows = [...rows].sort((a, b) => {
                const aCell = a.cells.find((c) => c.columnId === sortColumnId);
                const bCell = b.cells.find((c) => c.columnId === sortColumnId);
                const aVal = String(aCell?.displayValue || aCell?.value || "");
                const bVal = String(bCell?.displayValue || bCell?.value || "");
                const comparison = aVal.localeCompare(bVal);
                return sortDescending ? -comparison : comparison;
              });
            }
          }

          // Paginate
          const { rows: pagedRows, truncation } = truncateRows(
            rows,
            effectivePageSize,
            effectivePage,
            effectivePageSize
          );

          // Enrich rows with column names
          const enrichedRows = pagedRows.map((row) =>
            enrichRowWithColumnNames(row, columnIdToName)
          );

          return success({
            sheetId,
            sheetName: sheet.name,
            pagination: {
              page: effectivePage,
              pageSize: effectivePageSize,
              totalRows: truncation.totalRows,
              totalPages: truncation.totalPages,
              hasNextPage: truncation.hasMorePages,
              hasPreviousPage: effectivePage > 1,
            },
            columnCount: columns ? columns.length : allColumns.length,
            returnedRows: enrichedRows.length,
            rows: enrichedRows,
          });
        }

        case "smartsheet_get_row": {
          const { sheetId, rowId, columns } = args as {
            sheetId: string;
            rowId: string;
            columns?: string[];
          };

          // Get column mapping
          const columnIdToName = await client.getColumnIdToNameMap(sheetId);
          const columnNameToId = await client.getColumnMap(sheetId);

          // Get the row
          const row = (await client.getRow(sheetId, rowId)) as SheetRow;

          // Filter columns if specified
          let cells = row.cells;
          if (columns && columns.length > 0) {
            const columnIds = new Set(
              columns
                .map((name) => columnNameToId.get(name.toLowerCase()))
                .filter((id): id is string => id !== undefined)
            );
            cells = cells.filter((cell) => columnIds.has(cell.columnId));
          }

          // Build enriched response
          const enrichedRow: Record<string, unknown> = {
            _rowId: row.id,
            _rowNumber: row.rowNumber,
          };

          for (const cell of cells) {
            const columnName = columnIdToName.get(cell.columnId);
            if (columnName) {
              enrichedRow[columnName] = cell.displayValue ?? cell.value ?? null;
            }
          }

          return success({
            sheetId,
            row: enrichedRow,
          });
        }

        case "smartsheet_get_rows_by_ids": {
          const { sheetId, rowIds, columns } = args as {
            sheetId: string;
            rowIds: string[];
            columns?: string[];
          };

          if (rowIds.length > 100) {
            return error("Maximum 100 row IDs allowed per request");
          }

          // Get column mapping
          const allColumns = await client.getColumns(sheetId);
          const columnIdToName = new Map<string, string>();
          const columnNameToId = new Map<string, string>();
          for (const col of allColumns) {
            columnIdToName.set(col.id, col.title);
            columnNameToId.set(col.title.toLowerCase(), col.id);
          }

          // Build column filter
          const columnIds = columns
            ? columns
                .map((name) => columnNameToId.get(name.toLowerCase()))
                .filter((id): id is string => id !== undefined)
            : undefined;

          // Fetch sheet with row filter
          const sheet = (await client.getSheet(sheetId, {
            rowIds,
            columnIds,
          })) as SheetData;

          // Enrich rows
          const enrichedRows = sheet.rows.map((row) =>
            enrichRowWithColumnNames(row, columnIdToName)
          );

          return success({
            sheetId,
            sheetName: sheet.name,
            requestedRowCount: rowIds.length,
            returnedRowCount: enrichedRows.length,
            rows: enrichedRows,
          });
        }

        // ================================================================
        // Full Sheet Tool (with safety limits)
        // ================================================================

        case "smartsheet_get_sheet": {
          const {
            sheetId,
            includeAttachments,
            includeDiscussions,
            rowNumbers,
            rowIds,
            columns,
            maxRows,
          } = args as {
            sheetId: string;
            includeAttachments?: boolean;
            includeDiscussions?: boolean;
            rowNumbers?: number[];
            rowIds?: string[];
            columns?: string[];
            maxRows?: number;
          };

          const effectiveMaxRows = Math.min(
            maxRows || SMARTSHEET_LIMITS.MAX_ROWS_DEFAULT,
            SMARTSHEET_LIMITS.MAX_PAGE_SIZE
          );

          // Get column mapping
          const allColumns = await client.getColumns(sheetId);
          const columnIdToName = new Map<string, string>();
          const columnNameToId = new Map<string, string>();
          for (const col of allColumns) {
            columnIdToName.set(col.id, col.title);
            columnNameToId.set(col.title.toLowerCase(), col.id);
          }

          // Build column filter
          const columnIds = columns
            ? columns
                .map((name) => columnNameToId.get(name.toLowerCase()))
                .filter((id): id is string => id !== undefined)
            : undefined;

          // Fetch sheet
          const sheet = (await client.getSheet(sheetId, {
            includeAttachments,
            includeDiscussions,
            rowIds,
            columnIds,
          })) as SheetData;

          // Filter by row numbers if specified
          let rows = sheet.rows;
          if (rowNumbers && rowNumbers.length > 0) {
            const rowNumberSet = new Set(rowNumbers);
            rows = rows.filter((row) => rowNumberSet.has(row.rowNumber));
          }

          // Apply truncation
          const { rows: truncatedRows, truncation } = truncateRows(rows, effectiveMaxRows);

          // Enrich rows
          const enrichedRows = truncatedRows.map((row) =>
            enrichRowWithColumnNames(row, columnIdToName)
          );

          // Build column info for response
          const responseColumns = columns
            ? allColumns.filter((col) =>
                columns.some((name) => name.toLowerCase() === col.title.toLowerCase())
              )
            : allColumns;

          return success({
            sheetId,
            sheetName: sheet.name,
            columns: responseColumns.map((col) => ({
              id: col.id,
              name: col.title,
              type: col.type,
            })),
            truncation: truncation.truncated ? truncation : undefined,
            rowCount: enrichedRows.length,
            totalRowCount: truncation.totalRows,
            rows: enrichedRows,
          });
        }

        case "smartsheet_list_sheets": {
          const { includeAll, pageSize, page } = args as {
            includeAll?: boolean;
            pageSize?: number;
            page?: number;
          };

          const result = (await client.listSheets({
            includeAll,
            pageSize: pageSize || 100,
            page: page || 1,
          })) as {
            pageNumber: number;
            pageSize: number;
            totalPages: number;
            totalCount: number;
            data: Array<{
              id: string;
              name: string;
              createdAt?: string;
              modifiedAt?: string;
            }>;
          };

          return success({
            pagination: {
              page: result.pageNumber,
              pageSize: result.pageSize,
              totalPages: result.totalPages,
              totalCount: result.totalCount,
            },
            sheets: result.data.map((sheet) => ({
              id: String(sheet.id),
              name: sheet.name,
              modifiedAt: sheet.modifiedAt,
            })),
          });
        }

        // ================================================================
        // Write Operations
        // ================================================================

        case "smartsheet_create_row": {
          const { sheetId, cells, toTop, parentId } = args as {
            sheetId: string;
            cells: Array<{ columnName: string; value: string }>;
            toTop?: boolean;
            parentId?: string;
          };

          const columnMap = await client.getColumnMap(sheetId);

          const mappedCells = cells
            .map((cell) => ({
              columnId: columnMap.get(cell.columnName.toLowerCase()),
              value: cell.value,
            }))
            .filter((cell) => cell.columnId !== undefined) as Array<{
            columnId: string;
            value: unknown;
          }>;

          if (mappedCells.length === 0) {
            return error("No valid column names matched. Use smartsheet_get_columns to see available columns.");
          }

          const result = await client.createRow(
            sheetId,
            { cells: mappedCells },
            { toTop, parentId }
          );
          return success(result);
        }

        case "smartsheet_update_row": {
          const { sheetId, rowId, cells } = args as {
            sheetId: string;
            rowId: string;
            cells: Array<{ columnName: string; value: string }>;
          };

          const columnMap = await client.getColumnMap(sheetId);

          const mappedCells = cells
            .map((cell) => ({
              columnId: columnMap.get(cell.columnName.toLowerCase()),
              value: cell.value,
            }))
            .filter((cell) => cell.columnId !== undefined) as Array<{
            columnId: string;
            value: unknown;
          }>;

          if (mappedCells.length === 0) {
            return error("No valid column names matched. Use smartsheet_get_columns to see available columns.");
          }

          const result = await client.updateRow(sheetId, {
            id: rowId,
            cells: mappedCells,
          });
          return success(result);
        }

        case "smartsheet_delete_row": {
          const { sheetId, rowId } = args as { sheetId: string; rowId: string };
          const result = await client.deleteRow(sheetId, rowId);
          return success(result);
        }

        default:
          return error(`Unknown tool: ${name}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return error(message);
    }
  });

  // List resources (sheets as resources) - paginated
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    try {
      const result = (await client.listSheets({ pageSize: 50 })) as {
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

  // Read resource - with truncation
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    const match = uri.match(/^smartsheet:\/\/sheets\/(\d+)$/);
    if (!match) {
      throw new Error(`Invalid resource URI: ${uri}`);
    }

    const sheetId = match[1];

    // Get summary instead of full sheet to avoid large responses
    const columns = await client.getColumns(sheetId);
    const sheet = (await client.getSheet(sheetId, { pageSize: 1 })) as SheetData;

    const summary = {
      sheetId,
      name: sheet.name,
      columnCount: columns.length,
      rowCount: sheet.totalRowCount || sheet.rows?.length || 0,
      columns: columns.map((col) => ({
        name: col.title,
        type: col.type,
      })),
      hint: "Use smartsheet_get_rows_paginated tool to access row data.",
    };

    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(summary, null, 2),
        },
      ],
    };
  });

  return server;
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main() {
  const apiKey = process.env.SMARTSHEET_API_KEY;

  if (!apiKey) {
    console.error("SMARTSHEET_API_KEY environment variable is required");
    process.exit(1);
  }

  const server = createServer(apiKey);
  const transport = new StdioServerTransport();

  await server.connect(transport);

  console.error("Smartsheet MCP Server v2.0.0 running on stdio (optimized for large sheets)");
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
