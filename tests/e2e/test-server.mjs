import "../setup-stubs.mjs";
import { once } from "node:events";
import { createServer as createViteServer } from "vite";

import makeLinkHandler from "../../api/charter/make-link.js";
import downloadHandler from "../../api/charter/download.js";
import healthHandler from "../../api/charter/health.js";

const port = Number(process.env.PORT || process.env.PLAYWRIGHT_TEST_PORT || 4010);
if (!process.env.FILES_LINK_SECRET) {
  process.env.FILES_LINK_SECRET = "playwright-secret";
}

const vite = await createViteServer({
  root: process.cwd(),
  logLevel: "error",
  server: {
    port,
    host: "127.0.0.1",
  },
});

vite.middlewares.use(async (req, res, next) => {
  try {
    const originalUrl = req.originalUrl || req.url || "";
    const host = req.headers.host || `127.0.0.1:${port}`;
    const url = new URL(originalUrl, `http://${host}`);
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

    if (req.method === "POST" && url.pathname === "/api/transcribe") {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          transcript: "Assistant, render the voice charter docx",
        })
      );
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/chat") {
      const executeFlag =
        url.searchParams.get("execute") === "1" ||
        url.searchParams.get("execute") === "true";
      const body = await readJsonBody(req);

      if (executeFlag || body?.execute) {
        const charter = {
          project_name: "Voice Charter",
          sponsor: "Avery Example",
          project_lead: "Jordan Example",
          problem: "Voice command stub charter",
        };
        const base64Docx = Buffer.from("voice-charter-docx").toString("base64");
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify({
            reply: "Auto-run complete. Voice Charter is ready for download.",
            actions: [
              {
                action: "charter.render",
                executeNow: true,
                payload: { charter },
              },
            ],
            executed: [
              {
                action: "charter.render",
                status: "ok",
                ok: true,
                result: {
                  filename: "Voice Charter.docx",
                  mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                  buffer: { base64: base64Docx },
                  charter,
                },
              },
            ],
            operationId: "op-voice-1",
          })
        );
        return;
      }

      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          reply: "This is a stubbed chat response.",
          actions: [],
          executed: [],
          operationId: null,
        })
      );
      return;
    }

    next();
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

await vite.listen();
console.log(`test server listening on http://127.0.0.1:${port}`);

const signals = ["SIGINT", "SIGTERM", "SIGUSR2"];
for (const signal of signals) {
  process.on(signal, async () => {
    await vite.close();
    await once(vite.httpServer, "close");
    process.exit(0);
  });
}

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
  return res;
}
