import { useEffect, useMemo, useRef } from "react";

import { useStore } from "../lib/tinyStore.ts";
import { chatActions } from "../state/chatStore.ts";
import { draftActions, useDraft as usePreviewDraftStore } from "../state/draftStore.ts";
import { syncStoreApi, useDraft as useSyncDraft } from "../state/syncStore.ts";
import type { DraftDocument, DocumentPatch, SyncState } from "../types/sync.ts";

interface PreviewSyncState {
  draft: DraftDocument;
  pendingTurn: boolean;
  pendingTurnId?: string;
  latestPatchId?: string;
}

function createDraftDocument(source: DraftDocument, fields: Record<string, unknown>): DraftDocument {
  return {
    version: source.version,
    updatedAt: source.updatedAt,
    fields,
  };
}

function ensureObjectFields(fields: unknown): Record<string, unknown> {
  if (fields && typeof fields === "object" && !Array.isArray(fields)) {
    return fields as Record<string, unknown>;
  }
  return {};
}

function selectLatestPatch(state: SyncState): DocumentPatch | null {
  const { oplog } = state;
  if (!Array.isArray(oplog) || oplog.length === 0) {
    return null;
  }
  return oplog[oplog.length - 1] ?? null;
}

function selectPendingTurnId(state: SyncState): string | undefined {
  const { turns } = state;
  const pending = turns.find((turn) => turn.source === "agent" && turn.status === "open");
  return pending?.id;
}

export function usePreviewSyncService(): PreviewSyncState {
  const previewDraft = usePreviewDraftStore();
  const syncDraft = useSyncDraft();
  const latestPatch = useStore(syncStoreApi, selectLatestPatch);
  const pendingTurnId = useStore(syncStoreApi, selectPendingTurnId);
  const lastAppliedPatchIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!latestPatch) {
      return;
    }
    if (lastAppliedPatchIdRef.current === latestPatch.id) {
      return;
    }

    lastAppliedPatchIdRef.current = latestPatch.id;
    const fields = latestPatch.fields ?? {};
    draftActions.mergeDraft(fields);
  }, [latestPatch]);

  useEffect(() => {
    chatActions.setSyncingPreview(Boolean(pendingTurnId));
  }, [pendingTurnId]);

  const safeDraftFields = ensureObjectFields(previewDraft ?? {});
  const draftDocument = useMemo(
    () => createDraftDocument(syncDraft, safeDraftFields),
    [syncDraft, safeDraftFields],
  );

  return useMemo(
    () => ({
      draft: draftDocument,
      pendingTurn: Boolean(pendingTurnId),
      pendingTurnId: pendingTurnId ?? undefined,
      latestPatchId: latestPatch?.id,
    }),
    [draftDocument, latestPatch?.id, pendingTurnId],
  );
}

export default usePreviewSyncService;
