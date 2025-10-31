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
    if (key === "navigator") {
      previous.set(key, globalThis.navigator);
      globalThis.navigator = {
        ...dom.window.navigator,
      };
      continue;
    }

    previous.set(key, globalThis[key]);
    const value = dom.window[key];
    if (typeof value !== "undefined") {
      globalThis[key] = value;
    }
  }

  if (typeof dom.window.requestAnimationFrame === "function") {
    previous.set("requestAnimationFrame", globalThis.requestAnimationFrame);
    globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
  }

  if (typeof dom.window.cancelAnimationFrame === "function") {
    previous.set("cancelAnimationFrame", globalThis.cancelAnimationFrame);
    globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
  }

  const cleanup = () => {
    for (const [key, value] of previous.entries()) {
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
