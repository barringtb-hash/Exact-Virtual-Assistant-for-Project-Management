import { readEnv } from "../utils/env.ts";

export async function loadTemplateAsset(relPath: string) {
  if (typeof relPath !== "string") {
    throw new Error("Template asset path must be a string");
  }

  const normalizedPath = relPath.replace(/^\/+/, "").trim();
  if (!normalizedPath) {
    throw new Error("Template asset path is empty");
  }
  const baseRaw = readEnv("VITE_TEMPLATE_BASE_URL", "/templates/");
  const base = `${baseRaw}`.replace(/\/+$/, "") + "/";
  const url = `${base}${normalizedPath}`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Template asset "${normalizedPath}" not found (${response.status})`);
  }

  return response.json();
}

export default loadTemplateAsset;
