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
      const errorBody = await response.text();
      throw new Error(
        `Graph API error (${response.status}): ${errorBody}`
      );
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
    return this.request(`/teams/${teamId}/channels/${channelId}/messages`, {
      method: "POST",
      body: JSON.stringify({
        body: {
          contentType: "html",
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
    const worksheet = worksheetName || "Sheet1";
    return this.request(
      `/drives/${driveId}/items/${itemId}/workbook/worksheets/${worksheet}/range(address='${range}')`
    );
  }

  async writeExcelRange(
    driveId: string,
    itemId: string,
    worksheetName: string,
    range: string,
    values: unknown[][]
  ): Promise<unknown> {
    return this.request(
      `/drives/${driveId}/items/${itemId}/workbook/worksheets/${worksheetName}/range(address='${range}')`,
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
