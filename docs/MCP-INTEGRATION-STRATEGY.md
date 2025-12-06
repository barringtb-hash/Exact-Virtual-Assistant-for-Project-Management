# MCP Integration Strategy

## Executive Summary

This document outlines a strategy for integrating Model Context Protocol (MCP) into the Exact Virtual Assistant to enable Smartsheet, Office 365, and other external service integrations.

## Why MCP for These Integrations

### Traditional API Integration vs MCP

| Aspect | Traditional REST APIs | MCP Integration |
|--------|----------------------|-----------------|
| **AI Orchestration** | Manual prompt engineering per service | AI naturally discovers and uses tools |
| **Adding New Services** | Custom code for each API | Plug in new MCP server, AI adapts |
| **Context Sharing** | Manual data transformation | Unified resource/tool model |
| **Multi-Service Workflows** | Complex orchestration code | AI chains tools automatically |

### Concrete Benefits for This Project

1. **Smartsheet → Charter**: AI can read project data from Smartsheet and auto-populate charter fields
2. **Charter → SharePoint**: Generated documents automatically saved to project folders
3. **Teams Notifications**: AI posts charter updates to relevant channels
4. **Excel Data Import**: Pull budget/timeline data directly into DDPs
5. **Calendar Sync**: Project milestones pushed to Outlook calendars

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Exact Virtual Assistant                       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    MCP Client Layer                       │   │
│  │   Connects to external MCP servers for tool invocation    │   │
│  └────────────────────────┬─────────────────────────────────┘   │
│                           │                                      │
│  ┌────────────────────────┴─────────────────────────────────┐   │
│  │              AI Orchestration Layer                       │   │
│  │   (OpenAI + tool definitions from MCP servers)            │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
              │                    │                    │
              ▼                    ▼                    ▼
    ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
    │  Smartsheet     │  │  Office 365     │  │  Document       │
    │  MCP Server     │  │  MCP Server     │  │  Export Server  │
    │                 │  │  (Graph API)    │  │  (Optional)     │
    └─────────────────┘  └─────────────────┘  └─────────────────┘
              │                    │
              ▼                    ▼
    ┌─────────────────┐  ┌─────────────────────────────────────┐
    │  Smartsheet     │  │  Microsoft 365                       │
    │  API            │  │  SharePoint, Teams, Outlook, Excel   │
    └─────────────────┘  └─────────────────────────────────────┘
```

## Implementation Phases

### Phase 1: MCP Infrastructure (Week 1-2)

**Goal**: Set up MCP client capability in the application

#### 1.1 Add MCP Dependencies

```bash
npm install @modelcontextprotocol/sdk
```

#### 1.2 Create MCP Client Manager

New file: `server/mcp/MCPClientManager.ts`

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

interface MCPServerConfig {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export class MCPClientManager {
  private clients: Map<string, Client> = new Map();
  private configs: MCPServerConfig[];

  constructor(configs: MCPServerConfig[]) {
    this.configs = configs;
  }

  async initialize(): Promise<void> {
    for (const config of this.configs) {
      const transport = new StdioClientTransport({
        command: config.command,
        args: config.args,
        env: { ...process.env, ...config.env },
      });

      const client = new Client(
        { name: 'exact-va', version: '1.0.0' },
        { capabilities: { tools: {} } }
      );

      await client.connect(transport);
      this.clients.set(config.name, client);
    }
  }

  async listTools(): Promise<Tool[]> {
    const allTools: Tool[] = [];
    for (const [serverName, client] of this.clients) {
      const { tools } = await client.listTools();
      allTools.push(...tools.map(t => ({ ...t, server: serverName })));
    }
    return allTools;
  }

  async callTool(serverName: string, toolName: string, args: unknown): Promise<unknown> {
    const client = this.clients.get(serverName);
    if (!client) throw new Error(`MCP server '${serverName}' not found`);
    return client.callTool({ name: toolName, arguments: args });
  }

  async listResources(serverName: string): Promise<Resource[]> {
    const client = this.clients.get(serverName);
    if (!client) throw new Error(`MCP server '${serverName}' not found`);
    const { resources } = await client.listResources();
    return resources;
  }

  async readResource(serverName: string, uri: string): Promise<string> {
    const client = this.clients.get(serverName);
    if (!client) throw new Error(`MCP server '${serverName}' not found`);
    const { contents } = await client.readResource({ uri });
    return contents[0]?.text || '';
  }
}
```

#### 1.3 MCP Configuration

New file: `config/mcp-servers.json`

```json
{
  "servers": {
    "smartsheet": {
      "command": "node",
      "args": ["./mcp-servers/smartsheet/index.js"],
      "env": {
        "SMARTSHEET_API_KEY": "${SMARTSHEET_API_KEY}"
      }
    },
    "office365": {
      "command": "node",
      "args": ["./mcp-servers/office365/index.js"],
      "env": {
        "AZURE_CLIENT_ID": "${AZURE_CLIENT_ID}",
        "AZURE_CLIENT_SECRET": "${AZURE_CLIENT_SECRET}",
        "AZURE_TENANT_ID": "${AZURE_TENANT_ID}"
      }
    }
  }
}
```

### Phase 2: Smartsheet MCP Server (Week 2-3)

**Goal**: Create MCP server exposing Smartsheet operations

#### 2.1 Smartsheet MCP Server Structure

```
mcp-servers/
└── smartsheet/
    ├── index.ts           # Server entry point
    ├── tools/
    │   ├── sheets.ts      # List/read sheets
    │   ├── rows.ts        # CRUD on rows
    │   └── columns.ts     # Column operations
    └── resources/
        └── sheet.ts       # Sheet as resource
```

#### 2.2 Smartsheet Tools Definition

```typescript
// mcp-servers/smartsheet/tools/sheets.ts
export const smartsheetTools = [
  {
    name: 'smartsheet_list_sheets',
    description: 'List all accessible Smartsheet sheets',
    inputSchema: {
      type: 'object',
      properties: {
        includeAll: { type: 'boolean', default: false }
      }
    }
  },
  {
    name: 'smartsheet_get_sheet',
    description: 'Get sheet data including rows and columns',
    inputSchema: {
      type: 'object',
      properties: {
        sheetId: { type: 'string', description: 'Smartsheet ID' },
        includeAttachments: { type: 'boolean', default: false }
      },
      required: ['sheetId']
    }
  },
  {
    name: 'smartsheet_search_rows',
    description: 'Search for rows matching criteria',
    inputSchema: {
      type: 'object',
      properties: {
        sheetId: { type: 'string' },
        query: { type: 'string', description: 'Search query' },
        columnNames: {
          type: 'array',
          items: { type: 'string' },
          description: 'Columns to search in'
        }
      },
      required: ['sheetId', 'query']
    }
  },
  {
    name: 'smartsheet_create_row',
    description: 'Create a new row in a sheet',
    inputSchema: {
      type: 'object',
      properties: {
        sheetId: { type: 'string' },
        cells: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              columnName: { type: 'string' },
              value: { type: 'string' }
            }
          }
        }
      },
      required: ['sheetId', 'cells']
    }
  },
  {
    name: 'smartsheet_update_row',
    description: 'Update an existing row',
    inputSchema: {
      type: 'object',
      properties: {
        sheetId: { type: 'string' },
        rowId: { type: 'string' },
        cells: { type: 'array' }
      },
      required: ['sheetId', 'rowId', 'cells']
    }
  }
];
```

#### 2.3 Smartsheet Server Implementation

```typescript
// mcp-servers/smartsheet/index.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const SMARTSHEET_API_BASE = 'https://api.smartsheet.com/2.0';

class SmartsheetMCPServer {
  private server: Server;
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.SMARTSHEET_API_KEY!;
    this.server = new Server(
      { name: 'smartsheet', version: '1.0.0' },
      { capabilities: { tools: {}, resources: {} } }
    );
    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler('tools/list', async () => ({
      tools: smartsheetTools
    }));

    this.server.setRequestHandler('tools/call', async (request) => {
      const { name, arguments: args } = request.params;
      return this.handleToolCall(name, args);
    });

    this.server.setRequestHandler('resources/list', async () => ({
      resources: await this.listSheetResources()
    }));

    this.server.setRequestHandler('resources/read', async (request) => {
      const { uri } = request.params;
      return this.readSheetResource(uri);
    });
  }

  private async handleToolCall(name: string, args: unknown) {
    switch (name) {
      case 'smartsheet_list_sheets':
        return this.listSheets(args);
      case 'smartsheet_get_sheet':
        return this.getSheet(args);
      case 'smartsheet_search_rows':
        return this.searchRows(args);
      case 'smartsheet_create_row':
        return this.createRow(args);
      case 'smartsheet_update_row':
        return this.updateRow(args);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  private async apiCall(endpoint: string, options: RequestInit = {}) {
    const response = await fetch(`${SMARTSHEET_API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    if (!response.ok) {
      throw new Error(`Smartsheet API error: ${response.statusText}`);
    }
    return response.json();
  }

  private async listSheets(args: any) {
    const data = await this.apiCall('/sheets');
    return { content: [{ type: 'text', text: JSON.stringify(data.data, null, 2) }] };
  }

  private async getSheet(args: { sheetId: string }) {
    const data = await this.apiCall(`/sheets/${args.sheetId}`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }

  // ... additional method implementations

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}

const server = new SmartsheetMCPServer();
server.run().catch(console.error);
```

### Phase 3: Office 365 MCP Server (Week 3-4)

**Goal**: Create MCP server for Microsoft Graph API integration

#### 3.1 Office 365 MCP Server Structure

```
mcp-servers/
└── office365/
    ├── index.ts           # Server entry point
    ├── auth.ts            # MSAL authentication
    ├── tools/
    │   ├── sharepoint.ts  # SharePoint operations
    │   ├── teams.ts       # Teams messaging
    │   ├── outlook.ts     # Calendar/email
    │   └── excel.ts       # Excel operations
    └── resources/
        ├── drives.ts      # OneDrive/SharePoint files
        └── sites.ts       # SharePoint sites
```

#### 3.2 Office 365 Tools Definition

```typescript
export const office365Tools = [
  // SharePoint
  {
    name: 'sharepoint_upload_document',
    description: 'Upload a document to SharePoint',
    inputSchema: {
      type: 'object',
      properties: {
        siteId: { type: 'string' },
        folderPath: { type: 'string' },
        fileName: { type: 'string' },
        content: { type: 'string', description: 'Base64 encoded content' },
        contentType: { type: 'string' }
      },
      required: ['siteId', 'folderPath', 'fileName', 'content']
    }
  },
  {
    name: 'sharepoint_list_files',
    description: 'List files in a SharePoint folder',
    inputSchema: {
      type: 'object',
      properties: {
        siteId: { type: 'string' },
        folderPath: { type: 'string' }
      },
      required: ['siteId']
    }
  },
  {
    name: 'sharepoint_get_file',
    description: 'Download a file from SharePoint',
    inputSchema: {
      type: 'object',
      properties: {
        siteId: { type: 'string' },
        filePath: { type: 'string' }
      },
      required: ['siteId', 'filePath']
    }
  },

  // Teams
  {
    name: 'teams_send_message',
    description: 'Send a message to a Teams channel',
    inputSchema: {
      type: 'object',
      properties: {
        teamId: { type: 'string' },
        channelId: { type: 'string' },
        message: { type: 'string' },
        mentions: {
          type: 'array',
          items: { type: 'string' },
          description: 'User IDs to mention'
        }
      },
      required: ['teamId', 'channelId', 'message']
    }
  },
  {
    name: 'teams_list_channels',
    description: 'List channels in a team',
    inputSchema: {
      type: 'object',
      properties: {
        teamId: { type: 'string' }
      },
      required: ['teamId']
    }
  },

  // Outlook Calendar
  {
    name: 'outlook_create_event',
    description: 'Create a calendar event',
    inputSchema: {
      type: 'object',
      properties: {
        subject: { type: 'string' },
        start: { type: 'string', format: 'date-time' },
        end: { type: 'string', format: 'date-time' },
        attendees: { type: 'array', items: { type: 'string' } },
        body: { type: 'string' }
      },
      required: ['subject', 'start', 'end']
    }
  },

  // Excel
  {
    name: 'excel_read_range',
    description: 'Read data from an Excel file range',
    inputSchema: {
      type: 'object',
      properties: {
        driveId: { type: 'string' },
        itemId: { type: 'string' },
        worksheetName: { type: 'string' },
        range: { type: 'string', description: 'e.g., A1:D10' }
      },
      required: ['driveId', 'itemId', 'range']
    }
  },
  {
    name: 'excel_write_range',
    description: 'Write data to an Excel file range',
    inputSchema: {
      type: 'object',
      properties: {
        driveId: { type: 'string' },
        itemId: { type: 'string' },
        worksheetName: { type: 'string' },
        range: { type: 'string' },
        values: { type: 'array', items: { type: 'array' } }
      },
      required: ['driveId', 'itemId', 'range', 'values']
    }
  }
];
```

#### 3.3 Office 365 Authentication (Using Existing MSAL)

```typescript
// mcp-servers/office365/auth.ts
import { ConfidentialClientApplication } from '@azure/msal-node';

const msalConfig = {
  auth: {
    clientId: process.env.AZURE_CLIENT_ID!,
    clientSecret: process.env.AZURE_CLIENT_SECRET!,
    authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
  },
};

const cca = new ConfidentialClientApplication(msalConfig);

export async function getAccessToken(scopes: string[]): Promise<string> {
  const result = await cca.acquireTokenByClientCredential({ scopes });
  if (!result?.accessToken) {
    throw new Error('Failed to acquire access token');
  }
  return result.accessToken;
}

export async function graphApiCall(endpoint: string, options: RequestInit = {}) {
  const token = await getAccessToken(['https://graph.microsoft.com/.default']);
  const response = await fetch(`https://graph.microsoft.com/v1.0${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`Graph API error: ${response.statusText}`);
  }
  return response.json();
}
```

### Phase 4: Integration with AI Orchestration (Week 4-5)

**Goal**: Connect MCP tools to the existing AI flows

#### 4.1 Tool Bridge for OpenAI

The app uses OpenAI, so we need to bridge MCP tools to OpenAI's function calling format:

```typescript
// server/mcp/openaiToolBridge.ts
import { MCPClientManager } from './MCPClientManager';

export function mcpToolsToOpenAIFunctions(mcpTools: Tool[]): OpenAI.Chat.ChatCompletionTool[] {
  return mcpTools.map(tool => ({
    type: 'function',
    function: {
      name: `${tool.server}__${tool.name}`,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  }));
}

export async function handleOpenAIToolCall(
  mcpManager: MCPClientManager,
  toolCall: OpenAI.Chat.ChatCompletionMessageToolCall
): Promise<string> {
  const [serverName, toolName] = toolCall.function.name.split('__');
  const args = JSON.parse(toolCall.function.arguments);

  const result = await mcpManager.callTool(serverName, toolName, args);
  return JSON.stringify(result);
}
```

#### 4.2 Enhanced Chat Endpoint

Update `/api/chat.js` to include MCP tools:

```javascript
// api/chat.js (additions)
import { MCPClientManager } from '../server/mcp/MCPClientManager.js';
import { mcpToolsToOpenAIFunctions, handleOpenAIToolCall } from '../server/mcp/openaiToolBridge.js';
import mcpConfig from '../config/mcp-servers.json' assert { type: 'json' };

let mcpManager = null;

async function getMCPManager() {
  if (!mcpManager) {
    mcpManager = new MCPClientManager(Object.entries(mcpConfig.servers).map(
      ([name, config]) => ({ name, ...config })
    ));
    await mcpManager.initialize();
  }
  return mcpManager;
}

export default async function handler(req, res) {
  // ... existing code ...

  // Get MCP tools if integrations are enabled
  let mcpTools = [];
  if (process.env.MCP_INTEGRATIONS_ENABLED === 'true') {
    const manager = await getMCPManager();
    const tools = await manager.listTools();
    mcpTools = mcpToolsToOpenAIFunctions(tools);
  }

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: messages,
    tools: [...existingTools, ...mcpTools],
    // ... rest of config
  });

  // Handle tool calls
  if (completion.choices[0].message.tool_calls) {
    for (const toolCall of completion.choices[0].message.tool_calls) {
      if (toolCall.function.name.includes('__')) {
        // MCP tool call
        const result = await handleOpenAIToolCall(await getMCPManager(), toolCall);
        // Add result to conversation and continue...
      }
    }
  }

  // ... existing response handling ...
}
```

### Phase 5: UI Integration (Week 5-6)

**Goal**: Add UI for managing integrations and viewing connected services

#### 5.1 Integration Settings Component

```typescript
// src/components/IntegrationSettings.tsx
import { useState, useEffect } from 'react';

interface Integration {
  name: string;
  displayName: string;
  connected: boolean;
  status: 'active' | 'error' | 'disconnected';
}

export function IntegrationSettings() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);

  useEffect(() => {
    fetch('/api/integrations/status')
      .then(res => res.json())
      .then(setIntegrations);
  }, []);

  const handleConnect = async (name: string) => {
    const res = await fetch(`/api/integrations/${name}/connect`, { method: 'POST' });
    if (res.ok) {
      // Refresh status
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Connected Services</h2>
      {integrations.map(integration => (
        <div key={integration.name} className="flex items-center justify-between p-4 border rounded">
          <div>
            <h3 className="font-medium">{integration.displayName}</h3>
            <span className={`text-sm ${
              integration.status === 'active' ? 'text-green-600' : 'text-gray-500'
            }`}>
              {integration.status}
            </span>
          </div>
          <button
            onClick={() => handleConnect(integration.name)}
            className="px-4 py-2 bg-blue-600 text-white rounded"
          >
            {integration.connected ? 'Reconnect' : 'Connect'}
          </button>
        </div>
      ))}
    </div>
  );
}
```

#### 5.2 Context-Aware Tool Suggestions

```typescript
// src/hooks/useMCPContext.ts
export function useMCPContext() {
  const [availableTools, setAvailableTools] = useState<Tool[]>([]);
  const [suggestedActions, setSuggestedActions] = useState<SuggestedAction[]>([]);

  // When charter draft changes, suggest relevant MCP actions
  useEffect(() => {
    const suggestions: SuggestedAction[] = [];

    if (draft.projectName && integrations.smartsheet.connected) {
      suggestions.push({
        label: 'Import from Smartsheet',
        tool: 'smartsheet__smartsheet_search_rows',
        description: `Search for "${draft.projectName}" in Smartsheet`
      });
    }

    if (draft.isComplete && integrations.sharepoint.connected) {
      suggestions.push({
        label: 'Save to SharePoint',
        tool: 'office365__sharepoint_upload_document',
        description: 'Upload charter to project folder'
      });
    }

    setSuggestedActions(suggestions);
  }, [draft, integrations]);

  return { availableTools, suggestedActions };
}
```

## Environment Variables

Add to `.env.local`:

```bash
# MCP Integration Settings
MCP_INTEGRATIONS_ENABLED=true

# Smartsheet
SMARTSHEET_API_KEY=your-smartsheet-api-key

# Microsoft 365 (augments existing MSAL config)
AZURE_CLIENT_ID=your-client-id
AZURE_CLIENT_SECRET=your-client-secret
AZURE_TENANT_ID=your-tenant-id
```

## Directory Structure (New Files)

```
server/
└── mcp/
    ├── MCPClientManager.ts      # Client manager
    ├── openaiToolBridge.ts      # OpenAI function bridging
    └── index.ts                 # Exports

mcp-servers/
├── smartsheet/
│   ├── index.ts
│   ├── tools/
│   └── resources/
└── office365/
    ├── index.ts
    ├── auth.ts
    ├── tools/
    └── resources/

config/
└── mcp-servers.json             # Server configurations

src/
├── components/
│   └── IntegrationSettings.tsx  # Settings UI
└── hooks/
    └── useMCPContext.ts         # MCP context hook

api/
└── integrations/
    ├── status.js                # List integration status
    └── [name]/
        └── connect.js           # OAuth flow handling
```

## Use Case Flows

### Flow 1: Import Project Data from Smartsheet

```
User: "Create a charter for Project Alpha using data from Smartsheet"
    ↓
AI recognizes intent, calls smartsheet__smartsheet_search_rows
    ↓
Smartsheet MCP returns matching project rows
    ↓
AI extracts: project name, stakeholders, timeline, budget
    ↓
Fields auto-populated in charter draft
    ↓
User confirms/edits before finalizing
```

### Flow 2: Save Charter to SharePoint

```
User: "Save this charter to the Project Alpha folder in SharePoint"
    ↓
AI renders charter document (existing flow)
    ↓
AI calls office365__sharepoint_upload_document
    ↓
Document saved to SharePoint
    ↓
AI calls office365__teams_send_message (optional)
    ↓
Team notified of new charter
```

### Flow 3: Sync Milestones to Outlook

```
User: "Add the project milestones to my calendar"
    ↓
AI extracts milestones from charter
    ↓
For each milestone: office365__outlook_create_event
    ↓
Events created with project context
```

## Testing Strategy

### Unit Tests
- Mock MCP server responses
- Test tool bridging logic
- Test error handling

### Integration Tests
- Spin up local MCP servers
- Test end-to-end tool calls
- Test OAuth flows with test tenants

### E2E Tests
- Cypress tests for UI flows
- Test integration settings
- Test suggested actions

## Security Considerations

1. **OAuth Token Storage**: Use secure token storage (not localStorage)
2. **Scope Limiting**: Request minimum required Graph API scopes
3. **Rate Limiting**: Implement rate limiting for MCP tool calls
4. **Audit Logging**: Log all external service interactions
5. **Data Sanitization**: Sanitize data before sending to external services

## Rollout Plan

1. **Alpha**: Internal testing with dev accounts
2. **Beta**: Limited user testing with monitoring
3. **GA**: Full rollout with documentation

## Success Metrics

- Time to create charter with external data (vs manual)
- Document save success rate to SharePoint
- User adoption of integration features
- Error rates for MCP tool calls
