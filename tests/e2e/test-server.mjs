import "../setup-stubs.mjs";
import http from "http";
import { once } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createServer as createViteServer } from "vite";

import makeLinkHandler from "../../api/charter/make-link.js";
import downloadHandler from "../../api/charter/download.js";
import extractHandler from "../../api/charter/extract.js";
import healthHandler from "../../api/charter/health.js";
import docExtractHandler from "../../api/doc/extract.js";
import docValidateHandler from "../../api/doc/validate.js";
import docRenderHandler from "../../api/doc/render.js";
import filesTextHandler from "../../api/files/text.js";
import suggestDocType from "../../src/utils/docTypeRouter.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../..");

const port = Number(process.env.PORT || process.env.PLAYWRIGHT_TEST_PORT || 4010);
if (!process.env.FILES_LINK_SECRET) {
  process.env.FILES_LINK_SECRET = "playwright-secret";
}

const vite = await createViteServer({
  root: projectRoot,
  server: {
    middlewareMode: true,
    hmr: false,
  },
  appType: "spa",
  logLevel: process.env.VITE_LOG_LEVEL || "error",
});

const server = http.createServer(async (req, res) => {
  try {
    const host = req.headers.host || `127.0.0.1:${port}`;
    const url = new URL(req.url || "", `http://${host}`);

    if (!url.pathname.startsWith("/api/")) {
      vite.middlewares(req, res, () => {
        if (!res.headersSent) {
          res.statusCode = 404;
          res.setHeader("content-type", "text/plain");
          res.end("Not found");
        }
      });
      return;
    }

    const query = Object.create(null);
    for (const [key, value] of url.searchParams.entries()) {
      if (key in query) {
        const current = query[key];
        if (Array.isArray(current)) {
          current.push(value);
        } else {
          query[key] = [current, value];
        }
      } else {
        query[key] = value;
      }
    }

    if (req.method === "GET" && url.pathname === "/api/charter/health") {
      const nextReq = {
        method: req.method,
        headers: {
          ...req.headers,
          host,
          "x-forwarded-proto": "http",
        },
        query,
      };
      const nextRes = wrapResponse(res);
      await healthHandler(nextReq, nextRes);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/charter/make-link") {
      const body = await readJsonBody(req);
      const nextReq = {
        method: req.method,
        headers: {
          ...req.headers,
          host,
          "x-forwarded-proto": "http",
        },
        body,
        query,
      };
      const nextRes = wrapResponse(res);
      await makeLinkHandler(nextReq, nextRes);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/charter/extract") {
      const body = await readJsonBody(req);
      const nextReq = {
        method: req.method,
        headers: {
          ...req.headers,
          host,
          "x-forwarded-proto": "http",
        },
        body,
        query,
      };
      const nextRes = wrapResponse(res);
      await extractHandler(nextReq, nextRes);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/chat") {
      const body = await readJsonBody(req);
      const messages = Array.isArray(body?.messages) ? body.messages : [];
      const lastMessage = messages[messages.length - 1] || {};
      const normalizedText =
        typeof lastMessage?.content === "string"
          ? lastMessage.content.toLowerCase()
          : typeof lastMessage?.text === "string"
          ? lastMessage.text.toLowerCase()
          : "";
      let reply = "Happy to help with your project.";
      if (normalizedText.includes("sponsor")) {
        reply = "Great — I’ll set the Sponsor field and add them as an approver.";
      } else if (normalizedText.includes("roadmap")) {
        reply = "Let’s capture the milestones and next steps in your plan.";
      }

      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ reply }));
      return;
    }

    if (
      req.method === "POST" &&
      (url.pathname === "/api/documents/extract" || url.pathname === "/api/doc/extract")
    ) {
      const body = await readJsonBody(req);
      const nextReq = {
        method: req.method,
        headers: {
          ...req.headers,
          host,
          "x-forwarded-proto": "http",
        },
        body,
        query,
      };
      const nextRes = wrapResponse(res);
      await docExtractHandler(nextReq, nextRes);
      return;
    }

    if (
      req.method === "POST" &&
      (url.pathname === "/api/documents/validate" || url.pathname === "/api/doc/validate")
    ) {
      const body = await readJsonBody(req);
      const nextReq = {
        method: req.method,
        headers: {
          ...req.headers,
          host,
          "x-forwarded-proto": "http",
        },
        body,
        query,
      };
      const nextRes = wrapResponse(res);
      await docValidateHandler(nextReq, nextRes);
      return;
    }

    if (
      req.method === "POST" &&
      (url.pathname === "/api/documents/render" || url.pathname === "/api/doc/render")
    ) {
      const body = await readJsonBody(req);
      const nextReq = {
        method: req.method,
        headers: {
          ...req.headers,
          host,
          "x-forwarded-proto": "http",
        },
        body,
        query,
      };
      const nextRes = wrapResponse(res);
      await docRenderHandler(nextReq, nextRes);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/documents/router") {
      const body = await readJsonBody(req);
      const suggestion = suggestDocType({
        messages: Array.isArray(body?.messages) ? body.messages : [],
        attachments: Array.isArray(body?.attachments) ? body.attachments : [],
        voice: Array.isArray(body?.voice) ? body.voice : [],
      });
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(suggestion || { type: "charter", confidence: 0 }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/files/text") {
      const body = await readJsonBody(req);
      const nextReq = {
        method: req.method,
        headers: {
          ...req.headers,
          host,
          "x-forwarded-proto": "http",
        },
        body,
        query,
      };
      const nextRes = wrapResponse(res);
      await filesTextHandler(nextReq, nextRes);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/charter/download") {
      const nextReq = {
        method: req.method,
        headers: {
          ...req.headers,
          host,
          "x-forwarded-proto": "http",
        },
        query,
      };
      const nextRes = wrapResponse(res);
      await downloadHandler(nextReq, nextRes);
      return;
    }

    res.statusCode = 404;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "Not found" }));
  } catch (error) {
    console.error("test server error", error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "Internal server error" }));
    } else {
      res.end();
    }
  }
});

server.listen(port, () => {
  console.log(`test server listening on http://127.0.0.1:${port}`);
});

const signals = ["SIGINT", "SIGTERM", "SIGUSR2"];
let shuttingDown = false;

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    if (server.listening) {
      server.close();
      try {
        await once(server, "close");
      } catch (error) {
        console.error("error waiting for test server close", error);
      }
    }
  } finally {
    try {
      await vite.close();
    } catch (error) {
      console.error("error closing vite server", error);
    }
  }
}

for (const signal of signals) {
  process.on(signal, async () => {
    await shutdown();
    process.exit(0);
  });
}

process.on("beforeExit", async () => {
  await shutdown();
});

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  if (chunks.length === 0) {
    return {};
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function wrapResponse(res) {
  if (typeof res.status !== "function") {
    res.status = function status(code) {
      res.statusCode = code;
      return res;
    };
  }
  if (typeof res.json !== "function") {
    res.json = function json(payload) {
      if (!res.headersSent) {
        res.setHeader("content-type", "application/json");
      }
      res.end(JSON.stringify(payload));
      return res;
    };
  }
  if (typeof res.send !== "function") {
    res.send = function send(payload) {
      if (Buffer.isBuffer(payload) || typeof payload === "string") {
        res.end(payload);
        return res;
      }
      if (!res.headersSent) {
        res.setHeader("content-type", "application/json");
      }
      res.end(JSON.stringify(payload));
      return res;
    };
  }
  return res;
}
