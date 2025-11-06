export type InputSource = "user" | "agent";
export type InputStage = "draft" | "final";
export type InputPolicy = "exclusive" | "mixed";
export type InputSyncLayer = "none" | "local" | "remote";

export interface NormalizedInputEvent {
  id: string;
  turnId: string;
  source: InputSource;
  stage: InputStage;
  content: string;
  createdAt: number;
  metadata?: Record<string, unknown>;
}

export interface AgentTurn {
  id: string;
  source: InputSource;
  events: NormalizedInputEvent[];
  status: "open" | "finalized";
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

export interface DocumentPatch {
  id: string;
  version: number;
  fields: Record<string, unknown>;
  appliedAt: number;
}

export interface DraftDocument {
  version: number;
  fields: Record<string, unknown>;
  updatedAt: number;
}

export interface SyncBuffers {
  preview: NormalizedInputEvent[];
  final: NormalizedInputEvent[];
}

export interface SyncState {
  layer: InputSyncLayer;
  policy: InputPolicy;
  draft: DraftDocument;
  oplog: DocumentPatch[];
  turns: AgentTurn[];
  buffers: SyncBuffers;
  activeTurnId?: string;
}
