import crypto from "crypto";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb",
    },
  },
  maxDuration: 60,
  memory: 1024,
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const secret = process.env.FILES_LINK_SECRET;
  if (!secret) {
    console.error("FILES_LINK_SECRET is not configured");
    return res.status(500).json({ error: "Link configuration unavailable" });
  }

  const body = normalizeRequestBody(req.body);
  if (!body) {
    return res.status(400).json({ error: "Request body must be a JSON object" });
  }

  const { charter, baseName } = body;

  if (!isValidCharter(charter)) {
    return res.status(400).json({ error: "Invalid charter payload" });
  }

  const filenameBase = buildFilenameBase(baseName);
  const tokenPayload = {
    charter,
    filenameBase,
  };

  const token = encodeBase64Url(JSON.stringify(tokenPayload));
  const docxSig = createSignature("docx", token, secret);
  const pdfSig = createSignature("pdf", token, secret);

  return res.status(200).json({
    docx: `/api/charter/download?format=docx&token=${token}&sig=${docxSig}`,
    pdf: `/api/charter/download?format=pdf&token=${token}&sig=${pdfSig}`,
  });
}

function normalizeRequestBody(body) {
  if (body == null) {
    return null;
  }

  if (typeof body === "string") {
    const trimmed = body.trim();
    if (!trimmed) {
      return null;
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
      return null;
    } catch (error) {
      console.error("failed to parse make-link request body", error);
      return null;
    }
  }

  if (typeof body === "object" && !Array.isArray(body)) {
    return body;
  }

  return null;
}

function isValidCharter(charter) {
  return charter && typeof charter === "object" && !Array.isArray(charter);
}

function buildFilenameBase(baseName) {
  const DEFAULT_NAME = "Project_Charter";
  if (typeof baseName !== "string") {
    return DEFAULT_NAME;
  }

  const trimmed = baseName.trim();
  if (!trimmed) {
    return DEFAULT_NAME;
  }

  const sanitized = sanitizeFilename(trimmed);
  return sanitized || DEFAULT_NAME;
}

function sanitizeFilename(value) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function encodeBase64Url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createSignature(format, token, secret) {
  return crypto.createHmac("sha256", secret).update(`${format}.${token}`).digest("hex");
}
