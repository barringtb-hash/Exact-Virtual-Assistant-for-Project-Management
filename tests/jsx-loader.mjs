import { access, readFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { pathToFileURL } from "node:url";
import { transform } from "esbuild";

const LOADERS = [
  [".tsx", "tsx"],
  [".ts", "ts"],
  [".jsx", "jsx"],
  [".json", "json"],
];

export async function load(url, context, defaultLoad) {
  const entry = LOADERS.find(([extension]) => url.endsWith(extension));
  if (entry) {
    const [, loader] = entry;
    const fileUrl = url.startsWith("file:") ? url : pathToFileURL(url).href;
    const source = await readFile(new URL(fileUrl), "utf8");
    const result = await transform(source, {
      loader,
      format: "esm",
      jsx: "automatic",
      sourcemap: false,
    });
    return {
      format: "module",
      source: result.code,
      shortCircuit: true,
    };
  }

  return defaultLoad(url, context, defaultLoad);
}

async function tryResolveWithExtensions(specifier, parentURL) {
  if (!parentURL) {
    return null;
  }
  const base = new URL(specifier, parentURL);
  for (const extension of [".ts", ".tsx", ".js", ".jsx"]) {
    const candidate = new URL(`${base.href}${extension}`);
    try {
      await access(candidate, fsConstants.F_OK);
      return candidate.href;
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        continue;
      }
      throw error;
    }
  }
  return null;
}

export async function resolve(specifier, context, defaultResolve) {
  const overrideMap =
    globalThis.process?.__TEST_MODULE_OVERRIDES ?? globalThis?.__TEST_MODULE_OVERRIDES;
  const envKey = `TEST_OVERRIDE_${specifier}`;
  const overrideTarget =
    (overrideMap && typeof overrideMap === "object" ? overrideMap[specifier] : undefined) ??
    globalThis.process?.env?.[envKey];
  if (overrideTarget) {
    const overrideUrl =
      typeof overrideTarget === "string" && overrideTarget.startsWith("file:")
        ? overrideTarget
        : pathToFileURL(String(overrideTarget)).href;
    return { shortCircuit: true, url: overrideUrl };
  }
  try {
    return await defaultResolve(specifier, context, defaultResolve);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ERR_MODULE_NOT_FOUND" &&
      (specifier.startsWith("./") || specifier.startsWith("../") || specifier.startsWith("/"))
    ) {
      const resolvedUrl = await tryResolveWithExtensions(specifier, context.parentURL);
      if (resolvedUrl) {
        return { shortCircuit: true, url: resolvedUrl };
      }
    }
    throw error;
  }
}
