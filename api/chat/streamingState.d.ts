export interface ControllerEntry {
  threadId: string;
  controller: AbortController;
}

export const activeControllers: Map<string, ControllerEntry>;
export function registerStreamController(
  clientStreamId: string,
  threadId: string,
  controller: AbortController
): () => void;
export function getStreamController(clientStreamId: string): ControllerEntry | null;
export function removeStreamController(
  clientStreamId: string,
  controller?: AbortController
): void;
export function clearStreamControllers(): void;
