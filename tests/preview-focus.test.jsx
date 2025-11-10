import assert from "node:assert/strict";
import test from "node:test";
import React, { useEffect, useMemo, useState } from "react";
import { cleanup, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { FLAGS } from "../src/config/flags.ts";
import {
  getChatPanelClass,
  getPreviewPanelClass,
} from "../src/features/previewFocus/layout.ts";
import { installDomEnvironment } from "./helpers/domEnvironment.js";

const BREAKPOINT_QUERY = /(min-width:\s*1024px)/;

function installMatchMediaMock() {
  const windowRef = globalThis.window;
  const previous = windowRef?.matchMedia;
  const registry = new Map();
  let state = { lg: false };

  const evaluate = (query) => {
    if (!query) {
      return false;
    }
    if (BREAKPOINT_QUERY.test(query)) {
      return state.lg;
    }
    return false;
  };

  const notify = () => {
    for (const [mql, listeners] of registry.entries()) {
      const matches = evaluate(mql.media);
      if (mql.matches === matches) {
        continue;
      }
      mql.matches = matches;
      const event = { matches, media: mql.media };
      if (typeof mql.onchange === "function") {
        mql.onchange(event);
      }
      for (const listener of listeners) {
        listener(event);
      }
    }
  };

  const matchMedia = (query) => {
    const mql = {
      media: query,
      matches: evaluate(query),
      onchange: null,
      addEventListener(type, listener) {
        if (type !== "change" || typeof listener !== "function") {
          return;
        }
        const listeners = registry.get(mql);
        listeners.add(listener);
      },
      removeEventListener(type, listener) {
        if (type !== "change" || typeof listener !== "function") {
          return;
        }
        const listeners = registry.get(mql);
        listeners.delete(listener);
      },
      addListener(listener) {
        this.addEventListener("change", listener);
      },
      removeListener(listener) {
        this.removeEventListener("change", listener);
      },
      dispatchEvent() {
        return false;
      },
    };

    registry.set(mql, new Set());
    return mql;
  };

  if (windowRef) {
    windowRef.matchMedia = matchMedia;
  }

  return {
    setMedia(overrides) {
      state = { ...state, ...overrides };
      notify();
    },
    cleanup() {
      registry.clear();
      if (windowRef) {
        if (previous) {
          windowRef.matchMedia = previous;
        } else {
          delete windowRef.matchMedia;
        }
      }
    },
  };
}

function useBreakpoint(query) {
  const [matches, setMatches] = useState(() => globalThis.window.matchMedia(query).matches);

  useEffect(() => {
    const mql = globalThis.window.matchMedia(query);
    const handler = (event) => {
      setMatches(event.matches);
    };
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", handler);
      return () => mql.removeEventListener("change", handler);
    }
    mql.addListener(handler);
    return () => mql.removeListener(handler);
  }, [query]);

  return matches;
}

function PreviewFocusTestShell({ shouldShowPreview = true }) {
  const [isPreviewFocus, setPreviewFocus] = useState(false);
  const [chatOverlayPinned, setChatOverlayPinned] = useState(true);
  const isLarge = useBreakpoint("(min-width: 1024px)");

  const chatIsOverlay = useMemo(
    () => isPreviewFocus && FLAGS.CHAT_OVERLAY_ON_PREVIEW && chatOverlayPinned,
    [chatOverlayPinned, isPreviewFocus],
  );
  const chatPanelClassName = useMemo(
    () => getChatPanelClass({ chatIsOverlay, shouldShowPreview }),
    [chatIsOverlay, shouldShowPreview],
  );
  const previewPanelClassName = useMemo(
    () => getPreviewPanelClass({ chatIsOverlay, isPreviewFocus }),
    [chatIsOverlay, isPreviewFocus],
  );

  return (
    <div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <section
          data-testid="chat-panel"
          data-breakpoint={isLarge ? "lg" : "base"}
          className={chatPanelClassName}
          role={chatIsOverlay ? "complementary" : undefined}
          aria-label={chatIsOverlay ? "Chat assistant" : undefined}
        >
          Chat content
        </section>
        {shouldShowPreview ? (
          <aside data-testid="preview-panel" className={previewPanelClassName}>
            Preview content
          </aside>
        ) : null}
      </div>

      <div className="mt-4 flex gap-2">
        <button type="button" onClick={() => setPreviewFocus(true)}>
          Activate preview focus
        </button>
        <button type="button" onClick={() => setPreviewFocus(false)}>
          Reset preview focus
        </button>
        {isPreviewFocus ? (
          <button
            type="button"
            aria-pressed={chatOverlayPinned ? "true" : "false"}
            aria-label={chatOverlayPinned ? "Dock chat" : "Pop out chat"}
            onClick={() => setChatOverlayPinned((value) => !value)}
          >
            {chatOverlayPinned ? "Dock" : "Pop out"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

test("Preview focus layout toggles grid classes and aria hooks across breakpoints", async (t) => {
  const { cleanup: cleanupDom } = installDomEnvironment();
  const { setMedia, cleanup: cleanupMedia } = installMatchMediaMock();

  if (typeof globalThis !== "undefined") {
    globalThis.__FLAG_OVERRIDES__ = {
      VITE_PREVIEW_FOCUS_ENABLED: true,
      VITE_CHAT_OVERLAY_ON_PREVIEW: true,
      VITE_PREVIEW_CONDITIONAL_VISIBILITY: true,
    };
  }

  const user = userEvent.setup({ document: globalThis.document });

  t.after(() => {
    cleanup();
    cleanupDom();
    cleanupMedia();
    if (typeof globalThis !== "undefined") {
      globalThis.__FLAG_OVERRIDES__ = undefined;
    }
  });

  setMedia({ lg: true });
  const utils = render(<PreviewFocusTestShell />, {
    container: globalThis.document.body.appendChild(
      globalThis.document.createElement("div"),
    ),
  });

  const chatPanel = utils.getByTestId("chat-panel");
  assert.strictEqual(chatPanel.getAttribute("data-breakpoint"), "lg");
  assert.ok(chatPanel.className.includes("lg:col-span-8"));

  const previewPanel = utils.getByTestId("preview-panel");
  assert.ok(previewPanel.className.includes("lg:col-span-4"));

  await user.click(utils.getByRole("button", { name: /activate preview focus/i }));

  const dockButton = await utils.findByRole("button", { name: /dock chat/i });
  assert.strictEqual(dockButton.getAttribute("aria-pressed"), "true");

  assert.ok(utils.getByTestId("preview-panel").className.includes("lg:col-span-12"));
  assert.ok(chatPanel.className.includes("bottom-sheet"));
  assert.ok(chatPanel.className.includes("floating-card"));
  assert.strictEqual(chatPanel.getAttribute("role"), "complementary");
  assert.strictEqual(chatPanel.getAttribute("aria-label"), "Chat assistant");

  setMedia({ lg: false });
  await waitFor(() => {
    assert.strictEqual(chatPanel.getAttribute("data-breakpoint"), "base");
  });

  await user.click(dockButton);

  assert.ok(!chatPanel.className.includes("bottom-sheet"));
  assert.ok(!chatPanel.className.includes("floating-card"));
  assert.ok(chatPanel.className.includes("lg:col-span-8"));
  assert.strictEqual(chatPanel.getAttribute("role"), null);
  assert.strictEqual(chatPanel.getAttribute("aria-label"), null);
  assert.ok(utils.getByTestId("preview-panel").className.includes("lg:col-span-4"));

  const popOutButton = utils.getByRole("button", { name: /pop out chat/i });
  assert.strictEqual(popOutButton.getAttribute("aria-pressed"), "false");

  setMedia({ lg: true });
  await waitFor(() => {
    assert.strictEqual(chatPanel.getAttribute("data-breakpoint"), "lg");
  });

  await user.click(popOutButton);

  assert.ok(utils.getByTestId("preview-panel").className.includes("lg:col-span-12"));
  assert.ok(chatPanel.className.includes("bottom-sheet"));
  assert.ok(chatPanel.className.includes("floating-card"));
  assert.strictEqual(chatPanel.getAttribute("role"), "complementary");
  assert.strictEqual(chatPanel.getAttribute("aria-label"), "Chat assistant");
});
