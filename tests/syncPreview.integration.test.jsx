import assert from "node:assert/strict";
import test, { after, afterEach } from "node:test";
import React from "react";
import { cleanup, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { installDomEnvironment } from "./helpers/domEnvironment.js";

delete globalThis.navigator;
const { cleanup: cleanupDom } = installDomEnvironment();

after(() => {
  cleanupDom();
});

afterEach(() => {
  cleanup();
});

const resetStores = async () => {
  const syncModule = await import("../src/state/syncStore.ts");
  syncModule.resetSyncStore();
  const { draftActions } = await import("../src/state/draftStore.ts");
  draftActions.resetDraft();
  const voiceModule = await import("../src/state/voiceStore.ts");
  voiceModule.voiceStoreApi.setState({ status: "idle", streamId: undefined, transcripts: [] });
  const { InputGateway } = await import("../src/sync/InputGateway.ts");
  InputGateway.reset("typing");
  InputGateway.reset("voice");
};

test("composer typing and mic channel updates synchronize buffers", async () => {
  await resetStores();

  const { TextComposer } = await import("../src/ui/TextComposer.tsx");
  const { MicButton } = await import("../src/ui/MicButton.tsx");
  const syncModule = await import("../src/state/syncStore.ts");
  const voiceModule = await import("../src/state/voiceStore.ts");
  const { asrService } = await import("../src/voice/ASRService.ts");

  const user = userEvent.setup({ document: globalThis.document });

  const { getByTestId } = render(
    <div>
      <TextComposer />
      <MicButton />
    </div>,
  );

  const input = getByTestId("text-composer-input");
  assert.ok(input instanceof HTMLTextAreaElement);
  await user.type(input, "Hello sync world");

  await waitFor(() => {
    const state = syncModule.syncStoreApi.getState();
    const lastEvent = state.buffers.preview.at(-1);
    assert.ok(lastEvent, "expected a preview event from typing");
    assert.equal(lastEvent.content, "Hello sync world");
  });

  const submit = getByTestId("text-composer-submit");
  await user.click(submit);

  await waitFor(() => {
    const state = syncModule.syncStoreApi.getState();
    assert.equal(state.buffers.preview.length, 0);
    const finalEvent = state.buffers.final.at(-1);
    assert.ok(finalEvent, "expected finalized typing event");
    assert.equal(finalEvent.content, "Hello sync world");
  });

  await user.type(input, "Second draft");

  const micButton = getByTestId("mic-button");
  await user.click(micButton);

  await waitFor(() => {
    const voiceState = voiceModule.voiceStoreApi.getState();
    assert.equal(voiceState.status, "listening");
  });

  assert.equal(input.disabled, true, "typing should pause while mic active");

  await waitFor(() => {
    const state = syncModule.syncStoreApi.getState();
    assert.equal(state.buffers.preview.length, 0, "typing draft should finalize when mic starts");
  });

  asrService.receivePartial("  interim voice note  ");

  await waitFor(() => {
    const state = syncModule.syncStoreApi.getState();
    const voiceDraft = state.buffers.preview.find((event) => event.metadata?.channel === "voice");
    assert.ok(voiceDraft, "voice draft should populate preview buffer");
    assert.equal(voiceDraft.content, "interim voice note");
  });

  asrService.receiveFinal(" final voice note ");

  await waitFor(() => {
    const state = syncModule.syncStoreApi.getState();
    assert.equal(state.buffers.preview.some((event) => event.metadata?.channel === "voice"), false);
    const voiceFinal = state.buffers.final.find(
      (event) => event.metadata?.channel === "voice" && event.metadata?.interim === false,
    );
    assert.ok(voiceFinal, "voice final event should be stored");
    assert.equal(voiceFinal.content, "final voice note");
  });

  await waitFor(() => {
    assert.equal(input.disabled, false);
  });
});

test("preview sync service merges patches and tracks pending turns", async () => {
  await resetStores();

  const { usePreviewSyncService } = await import("../src/preview/PreviewSyncService.ts");
  const syncModule = await import("../src/state/syncStore.ts");

  function PreviewProbe() {
    const state = usePreviewSyncService();
    return (
      <div>
        <pre data-testid="preview-draft">{JSON.stringify(state.draft.fields)}</pre>
        <span data-testid="preview-pending">{String(state.pendingTurn)}</span>
        <span data-testid="preview-latest-patch">{state.latestPatchId ?? "none"}</span>
      </div>
    );
  }

  const { getByTestId } = render(<PreviewProbe />);

  const turnId = syncModule.beginAgentTurn("agent-turn-ci", 10);
  assert.ok(turnId);

  await waitFor(() => {
    const pending = getByTestId("preview-pending");
    assert.equal(pending.textContent, "true");
  });

  const patch = {
    id: "patch-ci-1",
    version: 1,
    fields: { summary: "Agent summary" },
    appliedAt: Date.now(),
  };
  syncModule.applyPatch(patch, { turnId, seq: 0 });

  await waitFor(() => {
    const latestPatch = getByTestId("preview-latest-patch");
    assert.equal(latestPatch.textContent, patch.id);
    const draftSnapshot = getByTestId("preview-draft");
    assert.ok(draftSnapshot.textContent?.includes("Agent summary"));
  });

  syncModule.completeAgentTurn(turnId, Date.now() + 5);

  await waitFor(() => {
    const pending = getByTestId("preview-pending");
    assert.equal(pending.textContent, "false");
  });
});
