import fs from "fs/promises";
import path from "path";
import Mustache from "mustache";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

export const config = {
  maxDuration: 60,
  memory: 1024,
};

export async function renderPdfBuffer(charter) {
  const templatePath = path.join(
    process.cwd(),
    "templates",
    "charter-export.html.mustache"
  );
  const template = await fs.readFile(templatePath, "utf8");
  const templateData = buildTemplateData(charter);
  const html = Mustache.render(template, templateData);

  let browser;
  let page;

  try {
    browser = await launchBrowser();
    page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "0.5in",
        bottom: "0.5in",
        left: "0.5in",
        right: "0.5in",
      },
    });

    return Buffer.from(pdfBuffer);
  } finally {
    try {
      if (page) {
        await page.close();
      }
    } catch (pageCloseError) {
      console.error("failed to close page", pageCloseError);
    }

    try {
      if (browser) {
        await browser.close();
      }
    } catch (browserCloseError) {
      console.error("failed to close browser", browserCloseError);
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  try {
    const charter = parseCharterBody(req);
    const pdfBuffer = await renderPdfBuffer(charter);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=project_charter.pdf"
    );
    res.status(200).send(pdfBuffer);
  } catch (error) {
    if (
      error?.name === "InvalidCharterPayloadError" &&
      error?.statusCode === 400
    ) {
      console.error("invalid charter payload for pdf", error);
      res.status(400).json({
        error: error.message,
        details: error.details || undefined,
      });
      return;
    }

    console.error("failed to export charter pdf", error);
    res.status(500).json({ error: "Failed to generate charter PDF" });
  }
}

function parseCharterBody(req) {
  const body = req.body;
  if (body == null) {
    return {};
  }

  if (typeof body === "string") {
    const trimmed = body.trim();
    if (!trimmed) {
      return {};
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
      throw new Error("Parsed value is not a JSON object.");
    } catch (error) {
      throw createInvalidCharterError(
        "Request body must be valid JSON matching the charter schema.",
        error
      );
    }
  }

  if (typeof body === "object" && !Array.isArray(body)) {
    return body;
  }

  throw createInvalidCharterError("Request body must be a JSON object.");
}

function createInvalidCharterError(message, originalError) {
  const error = new Error(message);
  error.name = "InvalidCharterPayloadError";
  error.statusCode = 400;
  error.details = originalError?.message;
  return error;
}

function buildTemplateData(charter) {
  const now = new Date();
  const generatedOn = formatDate(now);

  const scopeIn = normalizeStringList(charter.scope_in);
  const scopeOut = normalizeStringList(charter.scope_out);
  const risks = normalizeStringList(charter.risks);
  const assumptions = normalizeStringList(charter.assumptions);

  const milestones = Array.isArray(charter.milestones)
    ? charter.milestones
        .map((item) => {
          if (!item || typeof item !== "object") {
            return null;
          }

          const phase = toDisplayText(item.phase);
          const deliverable = toDisplayText(item.deliverable);
          const dateDisplay = formatDate(item.date) || "Not provided";

          return { phase, deliverable, dateDisplay };
        })
        .filter(Boolean)
    : [];

  const successMetrics = Array.isArray(charter.success_metrics)
    ? charter.success_metrics
        .map((item) => {
          if (!item || typeof item !== "object") {
            return null;
          }

          return {
            benefit: toDisplayText(item.benefit),
            metric: toDisplayText(item.metric),
            system_of_measurement: toDisplayText(item.system_of_measurement),
          };
        })
        .filter(Boolean)
    : [];

  const coreTeam = Array.isArray(charter.core_team)
    ? charter.core_team
        .map((member) => {
          if (!member || typeof member !== "object") {
            return null;
          }

          return {
            name: toDisplayText(member.name),
            role: toDisplayText(member.role),
            responsibilities: toOptionalText(member.responsibilities),
          };
        })
        .filter(Boolean)
    : [];

  return {
    generatedOn,
    projectName: toDisplayText(charter.project_name),
    sponsor: toDisplayText(charter.sponsor),
    projectLead: toDisplayText(charter.project_lead),
    startDate: formatDate(charter.start_date) || "Not provided",
    endDate: formatDate(charter.end_date) || "Not provided",
    vision: toDisplayText(charter.vision),
    problem: toDisplayText(charter.problem),
    description: toDisplayText(charter.description),
    scopeIn,
    scopeOut,
    risks,
    assumptions,
    milestones,
    successMetrics,
    coreTeam,
  };
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const list = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    list.push(trimmed);
  }
  return list;
}

function toDisplayText(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return "Not provided";
}

function toOptionalText(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return null;
}

function formatDate(value) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(value);
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.valueOf())) {
    return trimmed;
  }

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

async function launchBrowser() {
  const executablePath =
    process.env.CHROME_EXECUTABLE_PATH ||
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    (await chromium.executablePath());
  return puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath,
    headless: chromium.headless ?? true,
    ignoreHTTPSErrors: true,
  });
}
