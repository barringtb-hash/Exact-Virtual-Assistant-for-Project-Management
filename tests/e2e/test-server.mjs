import "../setup-stubs.mjs";
import http from "http";
import { once } from "node:events";

import makeLinkHandler from "../../api/charter/make-link.js";
import downloadHandler from "../../api/charter/download.js";
import healthHandler from "../../api/charter/health.js";

const port = Number(process.env.PORT || process.env.PLAYWRIGHT_TEST_PORT || 4010);
if (!process.env.FILES_LINK_SECRET) {
  process.env.FILES_LINK_SECRET = "playwright-secret";
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "", `http://${req.headers.host || `127.0.0.1:${port}`}`);
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
          host: req.headers.host || `127.0.0.1:${port}`,
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
          host: req.headers.host || `127.0.0.1:${port}`,
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
          host: req.headers.host || `127.0.0.1:${port}`,
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
for (const signal of signals) {
  process.on(signal, async () => {
    server.close();
    await once(server, "close");
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
