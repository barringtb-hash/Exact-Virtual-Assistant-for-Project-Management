import {
  applyPatch,
  beginAgentTurn,
  completeAgentTurn,
  reconcileAgentTurnId,
  syncStoreApi,
} from "../state/syncStore.ts";
import { emitCounter, emitTimer } from "../state/syncMetrics.ts";
import type { AgentTurn, DocumentPatch, InputPolicy } from "../types/sync.ts";

export interface ConversationControllerOptions {
  endpoint?: string;
  fetchImpl?: typeof fetch;
  onError?: (error: Error) => void;
}

export interface AgentTurnRequestPayload {
  docVersion: number;
  policy: InputPolicy;
  turns: AgentTurn[];
}

export interface AgentPatchChunk {
  turnId?: string;
  seq?: number;
  patch?: DocumentPatch;
  status?: string;
  done?: boolean;
}

const DEFAULT_ENDPOINT = "/api/agent/conversation";

function cloneTurn(turn: AgentTurn): AgentTurn {
  return {
    ...turn,
    events: turn.events.map((event) => ({
      ...event,
      metadata: event.metadata ? { ...event.metadata } : undefined,
    })),
  };
}

function normalisePatch(patch: DocumentPatch): DocumentPatch {
  return {
    ...patch,
    fields: { ...(patch.fields ?? {}) },
  };
}

function isCompletionChunk(chunk: AgentPatchChunk | null | undefined): boolean {
  if (!chunk) {
    return false;
  }
  if (chunk.done === true) {
    return true;
  }
  if (typeof chunk.status === "string") {
    const normalised = chunk.status.toLowerCase();
    return normalised === "done" || normalised === "completed" || normalised === "complete";
  }
  return false;
}

export class ConversationController {
  private endpoint: string;
  private fetchImpl: typeof fetch;
  private inflight: AbortController | null = null;
  private onError?: (error: Error) => void;
  private pendingTurnId: string | null = null;
  private pendingTurnStartedAt: number | null = null;
  private pendingTurnMetricsId: string | null = null;
  private pendingTurnCancelled = false;

  constructor(options: ConversationControllerOptions = {}) {
    this.endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.onError = options.onError;
  }

  cancel(reason?: string) {
    if (this.inflight) {
      try {
        this.inflight.abort(reason);
      } catch (_) {
        // Ignore abort errors – some browsers do not accept custom abort reasons.
      }
      this.inflight = null;
    }
    if (this.pendingTurnId) {
      this.pendingTurnCancelled = true;
    }
    this.completePendingTurn();
  }

  async sync(turns?: AgentTurn[]): Promise<void> {
    this.cancel();

    const payload = this.buildPayload(turns);
    const controller = new AbortController();
    this.inflight = controller;
    this.beginPendingTurn();

    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Agent conversation request failed with status ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let completed = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        buffer = await this.processBuffer(buffer, () => {
          completed = true;
        });
      }

      if (buffer.trim()) {
        await this.processBuffer(buffer, () => {
          completed = true;
        });
      }

      if (!completed) {
        completed = true;
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        this.onError?.(error instanceof Error ? error : new Error("Agent conversation failed"));
      }
      throw error;
    } finally {
      this.inflight = null;
      this.completePendingTurn();
    }
  }

  private buildPayload(explicitTurns?: AgentTurn[]): AgentTurnRequestPayload {
    const state = syncStoreApi.getState();
    const turns = explicitTurns ?? state.turns;
    return {
      docVersion: state.draft.version,
      policy: state.policy,
      turns: turns.map(cloneTurn),
    };
  }

  private async processBuffer(buffer: string, onComplete: () => void): Promise<string> {
    let working = buffer;
    while (true) {
      const newlineIndex = working.indexOf("\n");
      if (newlineIndex === -1) {
        break;
      }
      const chunk = working.slice(0, newlineIndex).trim();
      working = working.slice(newlineIndex + 1);
      if (!chunk) {
        continue;
      }
      if (chunk === "[DONE]") {
        onComplete();
        continue;
      }
      this.handleChunk(chunk, onComplete);
    }
    return working;
  }

  private handleChunk(rawChunk: string, onComplete: () => void) {
    let parsed: AgentPatchChunk | null = null;
    try {
      parsed = JSON.parse(rawChunk);
    } catch (error) {
      this.onError?.(error instanceof Error ? error : new Error("Unable to parse agent chunk"));
      return;
    }

    if (!parsed) {
      return;
    }

    if (parsed.patch && typeof parsed.patch === "object") {
      const patch = normalisePatch(parsed.patch);
      applyPatch(patch, {
        turnId: typeof parsed.turnId === "string" ? parsed.turnId : undefined,
        seq: typeof parsed.seq === "number" ? parsed.seq : undefined,
      });
    }

    if (parsed.turnId) {
      this.resolvePendingTurnId(parsed.turnId);
    }

    if (isCompletionChunk(parsed)) {
      onComplete();
    }
  }

  private beginPendingTurn() {
    const timestamp = Date.now();
    const turnId = beginAgentTurn(undefined, timestamp);
    this.pendingTurnId = turnId;
    this.pendingTurnStartedAt = timestamp;
    this.pendingTurnMetricsId = turnId;
    this.pendingTurnCancelled = false;
    emitCounter("sync.turn_started", 1, { turnId });
  }

  private resolvePendingTurnId(turnId: string) {
    if (!turnId) {
      return;
    }
    const timestamp = Date.now();
    if (!this.pendingTurnId) {
      this.pendingTurnId = beginAgentTurn(turnId, timestamp);
      if (this.pendingTurnStartedAt === null) {
        this.pendingTurnStartedAt = timestamp;
        emitCounter("sync.turn_started", 1, { turnId, reconciled: true });
      }
      this.pendingTurnMetricsId = this.pendingTurnId;
      return;
    }
    if (this.pendingTurnId === turnId) {
      return;
    }
    const previousId = this.pendingTurnId;
    this.pendingTurnId = reconcileAgentTurnId(this.pendingTurnId, turnId, timestamp);
    if (this.pendingTurnMetricsId === previousId) {
      this.pendingTurnMetricsId = this.pendingTurnId;
    }
  }

  private completePendingTurn() {
    if (!this.pendingTurnId) {
      return;
    }
    const pendingSnapshot = syncStoreApi.getState().pendingTurn;
    const completedAt = Date.now();
    const turnId = this.pendingTurnId;
    completeAgentTurn(turnId, completedAt);
    const startedAt = this.pendingTurnStartedAt;
    if (startedAt !== null) {
      const duration = Math.max(0, completedAt - startedAt);
      emitTimer("sync.turn_completed", duration, {
        turnId: this.pendingTurnMetricsId ?? turnId,
        appliedPatch: Boolean(pendingSnapshot?.hasAppliedPatch),
        cancelled: this.pendingTurnCancelled,
      });
    }
    this.pendingTurnId = null;
    this.pendingTurnMetricsId = null;
    this.pendingTurnStartedAt = null;
    this.pendingTurnCancelled = false;
  }
}

export default ConversationController;
