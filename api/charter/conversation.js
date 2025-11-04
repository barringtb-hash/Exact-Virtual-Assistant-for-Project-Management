import fs from "fs/promises";
import path from "path";

import { isCharterConversationPersistenceEnabled } from "../../config/featureFlags.js";

const persistenceEnabled = isCharterConversationPersistenceEnabled();
const baseDirectory = path.resolve(process.cwd(), "tmp", "conversations");
const memoryCache = new Map();

async function ensureDirectory() {
  if (!persistenceEnabled) {
    return;
  }
  await fs.mkdir(baseDirectory, { recursive: true });
}

function buildFilePath(conversationId) {
  return path.join(baseDirectory, `${conversationId}.json`);
}

export async function loadConversationSnapshot(conversationId) {
  const key = conversationId?.trim();
  if (!key) {
    return null;
  }
  if (memoryCache.has(key)) {
    return memoryCache.get(key) ?? null;
  }
  if (!persistenceEnabled) {
    return null;
  }
  try {
    const file = await fs.readFile(buildFilePath(key), "utf8");
    const parsed = JSON.parse(file);
    memoryCache.set(key, parsed);
    return parsed;
  } catch (error) {
    if (error && (error.code === "ENOENT" || error.code === "ENOTDIR")) {
      return null;
    }
    throw error;
  }
}

export async function saveConversationSnapshot(conversationId, snapshot) {
  const key = conversationId?.trim();
  if (!key) {
    throw new Error("conversationId is required");
  }
  if (!snapshot || typeof snapshot !== "object") {
    throw new Error("snapshot must be an object");
  }
  memoryCache.set(key, snapshot);
  if (persistenceEnabled) {
    await ensureDirectory();
    await fs.writeFile(buildFilePath(key), JSON.stringify(snapshot, null, 2), "utf8");
  }
  return snapshot;
}

export function deleteConversationSnapshot(conversationId) {
  const key = conversationId?.trim();
  if (!key) {
    return false;
  }
  const existed = memoryCache.delete(key);
  return existed;
}

export function __clearConversationCache() {
  memoryCache.clear();
}

function parseRequestBody(req) {
  if (!req.body || typeof req.body !== "object") {
    return {};
  }
  return req.body;
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    const { id } = req.query || {};
    const snapshot = await loadConversationSnapshot(typeof id === "string" ? id : Array.isArray(id) ? id[0] : null);
    if (!snapshot) {
      res.status(404).json({ error: "conversation_not_found" });
      return;
    }
    res.status(200).json({ state: snapshot });
    return;
  }

  if (req.method === "POST") {
    const body = parseRequestBody(req);
    const conversationId = typeof body?.id === "string" ? body.id : null;
    const snapshot = body?.state;
    if (!conversationId || !snapshot) {
      res.status(400).json({ error: "invalid_request" });
      return;
    }
    await saveConversationSnapshot(conversationId, snapshot);
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === "DELETE") {
    const { id } = req.query || {};
    const conversationId = typeof id === "string" ? id : Array.isArray(id) ? id[0] : null;
    if (!conversationId) {
      res.status(400).json({ error: "invalid_request" });
      return;
    }
    deleteConversationSnapshot(conversationId);
    if (persistenceEnabled) {
      try {
        await fs.unlink(buildFilePath(conversationId));
      } catch (error) {
        if (error && error.code !== "ENOENT") {
          throw error;
        }
      }
    }
    res.status(204).end();
    return;
  }

  res.setHeader("Allow", "GET,POST,DELETE");
  res.status(405).json({ error: "method_not_allowed" });
}
