/**
 * Office 365 MCP Tool Definitions
 *
 * Tools for interacting with Microsoft 365 services via Microsoft Graph API.
 * Includes SharePoint, Teams, Outlook, and Excel capabilities.
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";

// ==========================================
// SharePoint Tools
// ==========================================

/**
 * Upload document to SharePoint
 */
export const sharePointUploadTool: Tool = {
  name: "sharepoint_upload_document",
  description:
    "Upload a document to a SharePoint site. Use this to save generated charters or other documents to SharePoint.",
  inputSchema: {
    type: "object" as const,
    properties: {
      siteId: {
        type: "string",
        description: "SharePoint site ID or site URL",
      },
      folderPath: {
        type: "string",
        description: "Folder path within the document library (e.g., '/General/Projects')",
      },
      fileName: {
        type: "string",
        description: "Name for the uploaded file",
      },
      content: {
        type: "string",
        description: "Base64 encoded file content",
      },
      contentType: {
        type: "string",
        description:
          "MIME type of the file (e.g., 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')",
      },
    },
    required: ["siteId", "folderPath", "fileName", "content"],
  },
};

/**
 * List files in SharePoint folder
 */
export const sharePointListFilesTool: Tool = {
  name: "sharepoint_list_files",
  description: "List files and folders in a SharePoint document library or folder",
  inputSchema: {
    type: "object" as const,
    properties: {
      siteId: {
        type: "string",
        description: "SharePoint site ID or site URL",
      },
      folderPath: {
        type: "string",
        description: "Folder path (e.g., '/General/Projects'). Omit for root.",
      },
      includeChildren: {
        type: "boolean",
        default: false,
        description: "Include contents of subfolders",
      },
    },
    required: ["siteId"],
  },
};

/**
 * Download file from SharePoint
 */
export const sharePointGetFileTool: Tool = {
  name: "sharepoint_get_file",
  description: "Download a file from SharePoint. Returns file content and metadata.",
  inputSchema: {
    type: "object" as const,
    properties: {
      siteId: {
        type: "string",
        description: "SharePoint site ID or site URL",
      },
      filePath: {
        type: "string",
        description: "Full path to the file",
      },
    },
    required: ["siteId", "filePath"],
  },
};

/**
 * List SharePoint sites
 */
export const sharePointListSitesTool: Tool = {
  name: "sharepoint_list_sites",
  description: "List SharePoint sites accessible to the current user",
  inputSchema: {
    type: "object" as const,
    properties: {
      search: {
        type: "string",
        description: "Search term to filter sites",
      },
    },
  },
};

// ==========================================
// Teams Tools
// ==========================================

/**
 * Send message to Teams channel
 */
export const teamsSendMessageTool: Tool = {
  name: "teams_send_message",
  description:
    "Send a message to a Microsoft Teams channel. Use this to notify team members about document updates.",
  inputSchema: {
    type: "object" as const,
    properties: {
      teamId: {
        type: "string",
        description: "Teams team ID",
      },
      channelId: {
        type: "string",
        description: "Teams channel ID",
      },
      message: {
        type: "string",
        description: "Message content (supports basic HTML formatting)",
      },
      mentions: {
        type: "array",
        items: { type: "string" },
        description: "User IDs to @mention in the message",
      },
    },
    required: ["teamId", "channelId", "message"],
  },
};

/**
 * List Teams channels
 */
export const teamsListChannelsTool: Tool = {
  name: "teams_list_channels",
  description: "List channels in a Microsoft Teams team",
  inputSchema: {
    type: "object" as const,
    properties: {
      teamId: {
        type: "string",
        description: "Teams team ID",
      },
    },
    required: ["teamId"],
  },
};

/**
 * List Teams that user is a member of
 */
export const teamsListTeamsTool: Tool = {
  name: "teams_list_teams",
  description: "List Microsoft Teams teams that the current user is a member of",
  inputSchema: {
    type: "object" as const,
    properties: {},
  },
};

// ==========================================
// Outlook Calendar Tools
// ==========================================

/**
 * Create calendar event
 */
export const outlookCreateEventTool: Tool = {
  name: "outlook_create_event",
  description:
    "Create a calendar event in Outlook. Use this to schedule project milestones or meetings.",
  inputSchema: {
    type: "object" as const,
    properties: {
      subject: {
        type: "string",
        description: "Event title/subject",
      },
      start: {
        type: "string",
        format: "date-time",
        description: "Event start time (ISO 8601 format)",
      },
      end: {
        type: "string",
        format: "date-time",
        description: "Event end time (ISO 8601 format)",
      },
      body: {
        type: "string",
        description: "Event description/body (HTML supported)",
      },
      attendees: {
        type: "array",
        items: { type: "string" },
        description: "Email addresses of attendees",
      },
      location: {
        type: "string",
        description: "Event location",
      },
      isOnlineMeeting: {
        type: "boolean",
        default: false,
        description: "Create as Teams meeting",
      },
    },
    required: ["subject", "start", "end"],
  },
};

/**
 * List calendar events
 */
export const outlookListEventsTool: Tool = {
  name: "outlook_list_events",
  description: "List calendar events within a date range",
  inputSchema: {
    type: "object" as const,
    properties: {
      startDateTime: {
        type: "string",
        format: "date-time",
        description: "Start of date range",
      },
      endDateTime: {
        type: "string",
        format: "date-time",
        description: "End of date range",
      },
      search: {
        type: "string",
        description: "Search term to filter events",
      },
    },
    required: ["startDateTime", "endDateTime"],
  },
};

// ==========================================
// Excel Tools
// ==========================================

/**
 * Read Excel range
 */
export const excelReadRangeTool: Tool = {
  name: "excel_read_range",
  description:
    "Read data from an Excel file stored in OneDrive or SharePoint. Use this to import project data.",
  inputSchema: {
    type: "object" as const,
    properties: {
      driveId: {
        type: "string",
        description: "OneDrive or SharePoint drive ID",
      },
      itemId: {
        type: "string",
        description: "Excel file item ID",
      },
      worksheetName: {
        type: "string",
        description: "Worksheet name (uses first sheet if omitted)",
      },
      range: {
        type: "string",
        description: "Cell range in A1 notation (e.g., 'A1:D10')",
      },
    },
    required: ["driveId", "itemId", "range"],
  },
};

/**
 * Write Excel range
 */
export const excelWriteRangeTool: Tool = {
  name: "excel_write_range",
  description: "Write data to an Excel file stored in OneDrive or SharePoint",
  inputSchema: {
    type: "object" as const,
    properties: {
      driveId: {
        type: "string",
        description: "OneDrive or SharePoint drive ID",
      },
      itemId: {
        type: "string",
        description: "Excel file item ID",
      },
      worksheetName: {
        type: "string",
        description: "Worksheet name",
      },
      range: {
        type: "string",
        description: "Cell range in A1 notation",
      },
      values: {
        type: "array",
        items: {
          type: "array",
          items: { type: "string" },
        },
        description: "2D array of values to write",
      },
    },
    required: ["driveId", "itemId", "range", "values"],
  },
};

/**
 * All Office 365 tools grouped by service
 */
export const sharePointTools: Tool[] = [
  sharePointUploadTool,
  sharePointListFilesTool,
  sharePointGetFileTool,
  sharePointListSitesTool,
];

export const teamsTools: Tool[] = [
  teamsSendMessageTool,
  teamsListChannelsTool,
  teamsListTeamsTool,
];

export const outlookTools: Tool[] = [
  outlookCreateEventTool,
  outlookListEventsTool,
];

export const excelTools: Tool[] = [
  excelReadRangeTool,
  excelWriteRangeTool,
];

/**
 * All Office 365 tools
 */
export const office365Tools: Tool[] = [
  ...sharePointTools,
  ...teamsTools,
  ...outlookTools,
  ...excelTools,
];

export default office365Tools;
