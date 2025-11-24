/**
 * ID generation utility
 *
 * Provides a consistent method for generating unique IDs across the application.
 * Uses crypto.randomUUID() when available, falls back to timestamp-based IDs.
 */

/**
 * Generate a unique ID
 * @returns A unique identifier string
 */
export function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
