/**
 * Office 365 MCP Server
 *
 * Provides MCP tools for interacting with Microsoft 365 services via
 * Microsoft Graph API. Includes SharePoint, Teams, Outlook, and Excel.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { ConfidentialClientApplication } from "@azure/msal-node";

import { office365Tools } from "./tools.js";

const GRAPH_API_BASE = "https://graph.microsoft.com/v1.0";

// ============================================================================
// Security: Input Sanitization (HIGH-07, HIGH-08)
// ============================================================================

/**
 * HIGH-07: Escape HTML to prevent HTML injection in Teams messages
 */
function escapeHtml(text: string): string {
  if (typeof text !== "string") return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * HIGH-08: Validate Excel range address format
 * Returns validated range or throws error if invalid
 */
function validateExcelRange(range: string): string {
  if (typeof range !== "string") {
    throw new Error("Excel range must be a string");
  }

  const trimmed = range.trim();
  if (!trimmed) {
    throw new Error("Excel range cannot be empty");
  }

  // Excel range pattern: A1, A1:B2, Sheet1!A1:B2, 'Sheet Name'!A1:B2
  // Allow column letters A-XFD (Excel max), row numbers 1-1048576
  const rangePattern = /^(?:'[^']{1,31}'!|[A-Za-z0-9_]{1,31}!)?[A-Za-z]{1,3}[0-9]{1,7}(?::[A-Za-z]{1,3}[0-9]{1,7})?$/;

  if (!rangePattern.test(trimmed)) {
    throw new Error(`Invalid Excel range format: ${trimmed.slice(0, 50)}`);
  }

  // Additional length check for safety
  if (trimmed.length > 100) {
    throw new Error("Excel range too long");
  }

  return trimmed;
}

/**
 * HIGH-08: Validate worksheet name
 */
function validateWorksheetName(name: string | undefined): string {
  if (name === undefined) {
    return "Sheet1";
  }

  if (typeof name !== "string") {
    throw new Error("Worksheet name must be a string");
  }

  const trimmed = name.trim();
  if (!trimmed) {
    return "Sheet1";
  }

  // Worksheet names can't exceed 31 characters
  if (trimmed.length > 31) {
    throw new Error("Worksheet name cannot exceed 31 characters");
  }

  // Disallow certain characters in worksheet names
  const invalidChars = /[:\\/?*\[\]]/;
  if (invalidChars.test(trimmed)) {
    throw new Error("Worksheet name contains invalid characters");
  }

  return trimmed;
}

/**
 * Sanitize error messages for Graph API errors
 */
function sanitizeGraphError(status: number, errorBody: string): string {
  const statusMessages: Record<number, string> = {
    400: "Invalid request to Microsoft Graph API",
    401: "Microsoft Graph authentication failed",
    403: "Access denied to Microsoft resource",
    404: "Microsoft resource not found",
    429: "Microsoft Graph rate limit exceeded",
    500: "Microsoft Graph service error",
    503: "Microsoft Graph service unavailable",
  };

  return statusMessages[status] || `Microsoft Graph API error (${status})`;
}

/**
 * Microsoft Graph API client with MSAL authentication
 */
class GraphClient {
  private cca: ConfidentialClientApplication;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(config: {
    clientId: string;
    clientSecret: string;
    tenantId: string;
  }) {
    this.cca = new ConfidentialClientApplication({
      auth: {
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        authority: `https://login.microsoftonline.com/${config.tenantId}`,
      },
    });
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry - 60000) {
      return this.accessToken;
    }

    const result = await this.cca.acquireTokenByClientCredential({
      scopes: ["https://graph.microsoft.com/.default"],
    });

    if (!result?.accessToken) {
      throw new Error("Failed to acquire access token");
    }

    this.accessToken = result.accessToken;
    this.tokenExpiry = result.expiresOn?.getTime() || Date.now() + 3600000;

    return this.accessToken;
  }

  async request(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<unknown> {
    const token = await this.getAccessToken();

    const response = await fetch(`${GRAPH_API_BASE}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      // HIGH-07: Sanitize error messages to avoid leaking sensitive info
      const errorBody = await response.text();
      throw new Error(sanitizeGraphError(response.status, errorBody));
    }

    // Handle empty responses
    const text = await response.text();
    return text ? JSON.parse(text) : {};
  }

  // SharePoint methods
  async listSites(search?: string): Promise<unknown> {
    const endpoint = search
      ? `/sites?search=${encodeURIComponent(search)}`
      : "/sites";
    return this.request(endpoint);
  }

  async getSiteDrive(siteId: string): Promise<unknown> {
    return this.request(`/sites/${siteId}/drive`);
  }

  async listDriveItems(
    driveId: string,
    folderPath?: string
  ): Promise<unknown> {
    const endpoint = folderPath
      ? `/drives/${driveId}/root:${folderPath}:/children`
      : `/drives/${driveId}/root/children`;
    return this.request(endpoint);
  }

  async uploadFile(
    driveId: string,
    folderPath: string,
    fileName: string,
    content: Buffer
  ): Promise<unknown> {
    const path = `${folderPath}/${fileName}`.replace(/\/+/g, "/");
    return this.request(`/drives/${driveId}/root:${path}:/content`, {
      method: "PUT",
      body: content,
      headers: {
        "Content-Type": "application/octet-stream",
      },
    });
  }

  async downloadFile(driveId: string, itemId: string): Promise<Buffer> {
    const token = await this.getAccessToken();
    const response = await fetch(
      `${GRAPH_API_BASE}/drives/${driveId}/items/${itemId}/content`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.statusText}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }

  // Teams methods
  async listTeams(): Promise<unknown> {
    return this.request("/me/joinedTeams");
  }

  async listChannels(teamId: string): Promise<unknown> {
    return this.request(`/teams/${teamId}/channels`);
  }

  async sendChannelMessage(
    teamId: string,
    channelId: string,
    message: string
  ): Promise<unknown> {
    // HIGH-07: Escape HTML to prevent HTML injection attacks
    // Using plain text content type for safety
    return this.request(`/teams/${teamId}/channels/${channelId}/messages`, {
      method: "POST",
      body: JSON.stringify({
        body: {
          contentType: "text",
          content: message,
        },
      }),
    });
  }

  // Calendar methods
  async createEvent(event: {
    subject: string;
    start: { dateTime: string; timeZone: string };
    end: { dateTime: string; timeZone: string };
    body?: { contentType: string; content: string };
    attendees?: Array<{ emailAddress: { address: string } }>;
    location?: { displayName: string };
    isOnlineMeeting?: boolean;
  }): Promise<unknown> {
    return this.request("/me/events", {
      method: "POST",
      body: JSON.stringify(event),
    });
  }

  async listEvents(
    startDateTime: string,
    endDateTime: string
  ): Promise<unknown> {
    return this.request(
      `/me/calendarView?startDateTime=${startDateTime}&endDateTime=${endDateTime}`
    );
  }

  // Excel methods
  async readExcelRange(
    driveId: string,
    itemId: string,
    worksheetName: string | undefined,
    range: string
  ): Promise<unknown> {
    // HIGH-08: Validate worksheet name and range to prevent injection
    const validatedWorksheet = validateWorksheetName(worksheetName);
    const validatedRange = validateExcelRange(range);

    return this.request(
      `/drives/${driveId}/items/${itemId}/workbook/worksheets/${encodeURIComponent(validatedWorksheet)}/range(address='${encodeURIComponent(validatedRange)}')`
    );
  }

  async writeExcelRange(
    driveId: string,
    itemId: string,
    worksheetName: string,
    range: string,
    values: unknown[][]
  ): Promise<unknown> {
    // HIGH-08: Validate worksheet name and range to prevent injection
    const validatedWorksheet = validateWorksheetName(worksheetName);
    const validatedRange = validateExcelRange(range);

    return this.request(
      `/drives/${driveId}/items/${itemId}/workbook/worksheets/${encodeURIComponent(validatedWorksheet)}/range(address='${encodeURIComponent(validatedRange)}')`,
      {
        method: "PATCH",
        body: JSON.stringify({ values }),
      }
    );
  }
}

/**
 * Tool response helpers
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
 * Create the Office 365 MCP server
 */
function createServer(config: {
  clientId: string;
  clientSecret: string;
  tenantId: string;
}): Server {
  const client = new GraphClient(config);

  const server = new Server(
    {
      name: "office365",
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
    return { tools: office365Tools };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      // SharePoint tools
      if (name === "sharepoint_list_sites") {
        const { search } = args as { search?: string };
        const result = await client.listSites(search);
        return success(result);
      }

      if (name === "sharepoint_list_files") {
        const { siteId, folderPath } = args as {
          siteId: string;
          folderPath?: string;
        };
        const drive = (await client.getSiteDrive(siteId)) as { id: string };
        const result = await client.listDriveItems(drive.id, folderPath);
        return success(result);
      }

      if (name === "sharepoint_upload_document") {
        const { siteId, folderPath, fileName, content } = args as {
          siteId: string;
          folderPath: string;
          fileName: string;
          content: string;
        };
        const drive = (await client.getSiteDrive(siteId)) as { id: string };
        const buffer = Buffer.from(content, "base64");
        const result = await client.uploadFile(
          drive.id,
          folderPath,
          fileName,
          buffer
        );
        return success(result);
      }

      if (name === "sharepoint_get_file") {
        const { siteId, filePath } = args as {
          siteId: string;
          filePath: string;
        };
        const drive = (await client.getSiteDrive(siteId)) as { id: string };
        // Get file metadata first
        const metadata = await client.request(
          `/drives/${drive.id}/root:${filePath}`
        );
        return success(metadata);
      }

      // Teams tools
      if (name === "teams_list_teams") {
        const result = await client.listTeams();
        return success(result);
      }

      if (name === "teams_list_channels") {
        const { teamId } = args as { teamId: string };
        const result = await client.listChannels(teamId);
        return success(result);
      }

      if (name === "teams_send_message") {
        const { teamId, channelId, message } = args as {
          teamId: string;
          channelId: string;
          message: string;
        };
        const result = await client.sendChannelMessage(
          teamId,
          channelId,
          message
        );
        return success(result);
      }

      // Outlook tools
      if (name === "outlook_create_event") {
        const {
          subject,
          start,
          end,
          body,
          attendees,
          location,
          isOnlineMeeting,
        } = args as {
          subject: string;
          start: string;
          end: string;
          body?: string;
          attendees?: string[];
          location?: string;
          isOnlineMeeting?: boolean;
        };

        const event = {
          subject,
          start: { dateTime: start, timeZone: "UTC" },
          end: { dateTime: end, timeZone: "UTC" },
          body: body
            ? { contentType: "html" as const, content: body }
            : undefined,
          attendees: attendees?.map((email) => ({
            emailAddress: { address: email },
          })),
          location: location ? { displayName: location } : undefined,
          isOnlineMeeting,
        };

        const result = await client.createEvent(event);
        return success(result);
      }

      if (name === "outlook_list_events") {
        const { startDateTime, endDateTime } = args as {
          startDateTime: string;
          endDateTime: string;
        };
        const result = await client.listEvents(startDateTime, endDateTime);
        return success(result);
      }

      // Excel tools
      if (name === "excel_read_range") {
        const { driveId, itemId, worksheetName, range } = args as {
          driveId: string;
          itemId: string;
          worksheetName?: string;
          range: string;
        };
        const result = await client.readExcelRange(
          driveId,
          itemId,
          worksheetName,
          range
        );
        return success(result);
      }

      if (name === "excel_write_range") {
        const { driveId, itemId, worksheetName, range, values } = args as {
          driveId: string;
          itemId: string;
          worksheetName: string;
          range: string;
          values: unknown[][];
        };
        const result = await client.writeExcelRange(
          driveId,
          itemId,
          worksheetName,
          range,
          values
        );
        return success(result);
      }

      return error(`Unknown tool: ${name}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return error(message);
    }
  });

  // List resources (SharePoint sites as resources)
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    try {
      const result = (await client.listSites()) as {
        value: Array<{ id: string; displayName: string; webUrl: string }>;
      };

      const resources = result.value.map((site) => ({
        uri: `office365://sharepoint/sites/${site.id}`,
        name: site.displayName,
        description: `SharePoint Site: ${site.webUrl}`,
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

    const siteMatch = uri.match(/^office365:\/\/sharepoint\/sites\/(.+)$/);
    if (siteMatch) {
      const siteId = siteMatch[1];
      const drive = await client.getSiteDrive(siteId);
      const items = await client.listDriveItems((drive as { id: string }).id);

      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify({ drive, items }, null, 2),
          },
        ],
      };
    }

    throw new Error(`Unknown resource URI: ${uri}`);
  });

  return server;
}

/**
 * Main entry point
 */
async function main() {
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;
  const tenantId = process.env.AZURE_TENANT_ID;

  if (!clientId || !clientSecret || !tenantId) {
    console.error(
      "AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, and AZURE_TENANT_ID environment variables are required"
    );
    process.exit(1);
  }

  const server = createServer({ clientId, clientSecret, tenantId });
  const transport = new StdioServerTransport();

  await server.connect(transport);

  console.error("Office 365 MCP Server running on stdio");
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
