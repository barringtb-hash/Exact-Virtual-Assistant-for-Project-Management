import assert from "node:assert/strict";
import test from "node:test";
import React, { useEffect } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { installDomEnvironment } from "./helpers/domEnvironment.js";

test("ChatComposer streams tokens into the transcript", async (t) => {
  const { cleanup: cleanupDom } = installDomEnvironment();

  const streamCalls = [];
  const mockStream = (path, options = {}) => {
    streamCalls.push({ path, options });
    const { onToken, onOpen, onComplete } = options;
    setTimeout(() => {
      onOpen?.();
      onToken?.("Hello");
      onToken?.(" world!");
      onComplete?.();
    }, 0);
    return () => {
      streamCalls[streamCalls.length - 1].disposed = true;
    };
  };

  const apiModule = await import("../src/chat/api.js");
  const streamMock = t.mock.method(apiModule, "openChatStreamFetch", mockStream);
  t.after(() => {
    streamMock.mock.restore();
  });

  const { ChatComposer } = await import("../src/chat/ChatComposer.tsx");
  const { ChatTranscript } = await import("../src/chat/ChatTranscript.tsx");
  const { ChatProvider, useChatSession } = await import("../src/chat/ChatContext.tsx");

  const messagesLog = [];
  function MessageRecorder() {
    const { messages } = useChatSession();
    useEffect(() => {
      messagesLog.push(messages.map((entry) => ({ ...entry })));
    }, [messages]);
    return null;
  }

  const user = userEvent.setup();

  render(
    <ChatProvider>
      <MessageRecorder />
      <ChatTranscript emptyPlaceholder={<span>No messages</span>} />
      <ChatComposer />
    </ChatProvider>,
  );

  const input = screen.getByLabelText("Chat composer");
  await user.type(input, "Draft the kickoff plan");
  await user.keyboard("{Enter}");

  await waitFor(() => {
    assert.ok(screen.getByText("Hello world!"));
  });

  assert.equal(streamCalls.length, 1);
  const [{ options: streamOptions }] = streamCalls;
  assert.equal(typeof streamOptions.requestInit?.body, "string");
  const payload = JSON.parse(streamOptions.requestInit.body);
  assert.equal(payload.messages.at(-1)?.content, "Draft the kickoff plan");

  const finalSnapshot = messagesLog.at(-1) ?? [];
  const assistantMessage = finalSnapshot.find((entry) => entry.role === "assistant");
  assert.ok(assistantMessage, "expected assistant message in transcript");
  assert.equal(assistantMessage.content, "Hello world!");

  cleanup();
  cleanupDom();
});

test("ChatComposer onComplete callback receives merged history for extraction", async (t) => {
  const { cleanup: cleanupDom } = installDomEnvironment();

  const mockStream = (path, options = {}) => {
    setTimeout(() => {
      options.onToken?.("Draft ready ");
      options.onToken?.("for review");
      options.onComplete?.();
    }, 0);
    return () => {};
  };

  const apiModule = await import("../src/chat/api.js");
  const streamMock = t.mock.method(apiModule, "openChatStreamFetch", mockStream);
  t.after(() => {
    streamMock.mock.restore();
  });

  const { ChatComposer } = await import("../src/chat/ChatComposer.tsx");
  const { ChatProvider, useChatSession } = await import("../src/chat/ChatContext.tsx");

  let latestMessages = [];
  function Recorder() {
    const { messages } = useChatSession();
    useEffect(() => {
      latestMessages = messages.map((entry) => ({ ...entry }));
    }, [messages]);
    return null;
  }

  const extractionPayloads = [];
  const handleComplete = (message) => {
    extractionPayloads.push({
      final: { ...message },
      history: latestMessages.map((entry) => ({ ...entry })),
    });
  };

  const user = userEvent.setup();

  render(
    <ChatProvider>
      <Recorder />
      <ChatComposer onComplete={handleComplete} />
    </ChatProvider>,
  );

  const input = screen.getByLabelText("Chat composer");
  await user.type(input, "Summarize the project risks");
  await user.click(screen.getByRole("button", { name: "Send" }));

  await waitFor(() => {
    assert.equal(extractionPayloads.length, 1);
  });

  const [{ final, history }] = extractionPayloads;
  assert.equal(final.role, "assistant");
  assert.equal(final.content, "Draft ready for review");
  assert.equal(history.length, 2);
  assert.equal(history[0].role, "user");
  assert.equal(history[0].content, "Summarize the project risks");
  assert.equal(history[1].content, "Draft ready for review");

  cleanup();
  cleanupDom();
});
