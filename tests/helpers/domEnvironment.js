import { JSDOM } from "jsdom";

const GLOBAL_KEYS = [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "HTMLInputElement",
  "HTMLTextAreaElement",
  "getComputedStyle",
  "CustomEvent",
];

export function installDomEnvironment() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
    pretendToBeVisual: true,
  });

  const previous = new Map();

  for (const key of GLOBAL_KEYS) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    previous.set(key, { value: globalThis[key], descriptor });

    const value = dom.window[key];
    if (typeof value === "undefined") {
      continue;
    }

    if (key === "navigator") {
      try {
        globalThis.navigator = {
          ...dom.window.navigator,
        };
      } catch {
        Object.defineProperty(globalThis, "navigator", {
          configurable: true,
          writable: true,
          value: {
            ...dom.window.navigator,
          },
        });
      }
      continue;
    }

    try {
      globalThis[key] = value;
    } catch {
      Object.defineProperty(globalThis, key, {
        configurable: true,
        writable: true,
        value,
      });
    }
  }

  if (typeof dom.window.requestAnimationFrame === "function") {
    previous.set("requestAnimationFrame", {
      value: globalThis.requestAnimationFrame,
      descriptor: Object.getOwnPropertyDescriptor(globalThis, "requestAnimationFrame"),
    });
    globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
  }

  if (typeof dom.window.cancelAnimationFrame === "function") {
    previous.set("cancelAnimationFrame", {
      value: globalThis.cancelAnimationFrame,
      descriptor: Object.getOwnPropertyDescriptor(globalThis, "cancelAnimationFrame"),
    });
    globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
  }

  const cleanup = () => {
    for (const [key, record] of previous.entries()) {
      const { descriptor, value } = record;

      if (descriptor) {
        try {
          Object.defineProperty(globalThis, key, descriptor);
          continue;
        } catch {
          // fall through to best-effort assignment below
        }
      }

      if (typeof value === "undefined") {
        delete globalThis[key];
      } else {
        globalThis[key] = value;
      }
    }
    dom.window.close();
  };

  return { window: dom.window, cleanup };
}
