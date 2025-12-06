/**
 * MCP Resource Definitions for Exact Virtual Assistant
 *
 * Resources provide read-only access to application state and configuration.
 */

import type { Resource } from "@modelcontextprotocol/sdk/types.js";

/**
 * Resource templates for dynamic resources
 */
export interface ResourceTemplate {
  uriTemplate: string;
  name: string;
  description: string;
  mimeType: string;
}

/**
 * Current draft resource - provides the active document draft
 */
export const currentDraftResource: Resource = {
  uri: "exact-va://draft/current",
  name: "Current Draft",
  description: "The current document draft with all field values and their lock status",
  mimeType: "application/json",
};

/**
 * Latest review resource - provides the most recent review results
 */
export const latestReviewResource: Resource = {
  uri: "exact-va://review/latest",
  name: "Latest Review",
  description:
    "Most recent document review results including scores, strengths, and feedback items",
  mimeType: "application/json",
};

/**
 * Session state resource - provides guided charter session state
 */
export const sessionStateResource: Resource = {
  uri: "exact-va://session/state",
  name: "Session State",
  description:
    "Current guided document creation session state including current field, progress, and navigation history",
  mimeType: "application/json",
};

/**
 * Document schema resource template
 */
export const schemaResourceTemplate: ResourceTemplate = {
  uriTemplate: "exact-va://schema/{docType}",
  name: "Document Schema",
  description: "Field definitions and validation rules for a specific document type",
  mimeType: "application/json",
};

/**
 * Field rules resource template
 */
export const fieldRulesResourceTemplate: ResourceTemplate = {
  uriTemplate: "exact-va://rules/{docType}",
  name: "Field Rules",
  description: "Validation and business rules for document fields",
  mimeType: "application/json",
};

/**
 * Static resources (always available)
 */
export const staticResources: Resource[] = [
  currentDraftResource,
  latestReviewResource,
  sessionStateResource,
];

/**
 * Resource templates (parameterized)
 */
export const resourceTemplates: ResourceTemplate[] = [
  schemaResourceTemplate,
  fieldRulesResourceTemplate,
];

export default {
  staticResources,
  resourceTemplates,
};
