/**
 * IntegrationStatus Component
 *
 * Displays the status of MCP integrations and connected services.
 */

import { useState, useEffect, useCallback } from "react";

/**
 * Server status badge component
 */
function ServerBadge({ name, info }) {
  const isConnected = info.connected;
  const isEnabled = info.enabled;
  const isConfigured = info.envConfigured;

  const getStatusColor = () => {
    if (isConnected) return "bg-green-100 text-green-800 border-green-200";
    if (isEnabled && isConfigured) return "bg-yellow-100 text-yellow-800 border-yellow-200";
    if (isEnabled && !isConfigured) return "bg-orange-100 text-orange-800 border-orange-200";
    return "bg-gray-100 text-gray-600 border-gray-200";
  };

  const getStatusText = () => {
    if (isConnected) return "Connected";
    if (isEnabled && isConfigured) return "Ready";
    if (isEnabled && !isConfigured) return "Not Configured";
    return "Disabled";
  };

  return (
    <div className={`px-3 py-2 rounded-lg border ${getStatusColor()}`}>
      <div className="font-medium text-sm">{name}</div>
      <div className="text-xs opacity-75">{getStatusText()}</div>
      {info.requiredEnv?.length > 0 && !isConfigured && (
        <div className="text-xs mt-1 opacity-60">
          Missing: {info.requiredEnv.filter((env) => !process.env[env]).join(", ")}
        </div>
      )}
    </div>
  );
}

/**
 * Tool list component
 */
function ToolList({ tools }) {
  const [expanded, setExpanded] = useState(false);
  const displayTools = expanded ? tools : tools.slice(0, 5);

  if (!tools.length) {
    return <p className="text-gray-500 text-sm">No tools available</p>;
  }

  return (
    <div>
      <ul className="space-y-1">
        {displayTools.map((tool, index) => (
          <li key={index} className="text-sm">
            <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">
              {tool.serverName}__{tool.name}
            </span>
            <span className="text-gray-500 ml-2 text-xs">{tool.description}</span>
          </li>
        ))}
      </ul>
      {tools.length > 5 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-blue-600 text-sm mt-2 hover:underline"
        >
          {expanded ? "Show less" : `Show ${tools.length - 5} more...`}
        </button>
      )}
    </div>
  );
}

/**
 * Main IntegrationStatus component
 */
export default function IntegrationStatus({ className = "" }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/integrations/status");
      if (!response.ok) {
        throw new Error(`Failed to fetch status: ${response.status}`);
      }
      const data = await response.json();
      setStatus(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  if (loading) {
    return (
      <div className={`p-4 ${className}`}>
        <div className="animate-pulse flex items-center gap-2">
          <div className="w-4 h-4 bg-gray-200 rounded-full"></div>
          <div className="h-4 bg-gray-200 rounded w-32"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-4 ${className}`}>
        <div className="text-red-600 text-sm flex items-center gap-2">
          <span>⚠</span>
          <span>Failed to load integration status</span>
          <button
            onClick={fetchStatus}
            className="text-blue-600 hover:underline ml-2"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!status) {
    return null;
  }

  const { enabled, servers, tools, summary } = status;

  return (
    <div className={`${className}`}>
      {/* Compact view - always visible */}
      <div
        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-2 h-2 rounded-full ${
              enabled && summary?.connectedServers > 0
                ? "bg-green-500"
                : enabled
                  ? "bg-yellow-500"
                  : "bg-gray-400"
            }`}
          />
          <span className="font-medium text-sm">MCP Integrations</span>
          {enabled && (
            <span className="text-xs text-gray-500">
              {summary?.connectedServers || 0} server{summary?.connectedServers !== 1 ? "s" : ""},{" "}
              {summary?.availableTools || 0} tool{summary?.availableTools !== 1 ? "s" : ""}
            </span>
          )}
          {!enabled && <span className="text-xs text-gray-400">Disabled</span>}
        </div>
        <span className="text-gray-400 text-sm">{expanded ? "▲" : "▼"}</span>
      </div>

      {/* Expanded view */}
      {expanded && (
        <div className="mt-4 space-y-4 p-4 border rounded-lg">
          {/* Status indicator */}
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Integration Status</h3>
            <button
              onClick={fetchStatus}
              className="text-sm text-blue-600 hover:underline"
            >
              Refresh
            </button>
          </div>

          {/* Servers section */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">MCP Servers</h4>
            <div className="flex flex-wrap gap-2">
              {Object.entries(servers || {}).map(([name, info]) => (
                <ServerBadge key={name} name={name} info={info} />
              ))}
            </div>
          </div>

          {/* Tools section */}
          {tools?.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">
                Available Tools ({tools.length})
              </h4>
              <ToolList tools={tools} />
            </div>
          )}

          {/* Configuration help */}
          {enabled && summary?.connectedServers === 0 && (
            <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-800">
              <p className="font-medium">No servers connected</p>
              <p className="text-xs mt-1">
                Configure environment variables in <code>.env.local</code> to enable external
                integrations:
              </p>
              <ul className="text-xs mt-2 space-y-1">
                <li>
                  <code>SMARTSHEET_API_KEY</code> - Enable Smartsheet integration
                </li>
                <li>
                  <code>AZURE_CLIENT_ID</code>, <code>AZURE_CLIENT_SECRET</code>,{" "}
                  <code>AZURE_TENANT_ID</code> - Enable Office 365 integration
                </li>
              </ul>
            </div>
          )}

          {/* MCP error display */}
          {status.mcpError && (
            <div className="bg-red-50 p-3 rounded-lg text-sm text-red-800">
              <p className="font-medium">MCP Error</p>
              <p className="text-xs mt-1 font-mono">{status.mcpError}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
