import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { transform } from "esbuild";

const STUB_MAP = {
  docxtemplater: "./_stubs/packages/docxtemplater/index.js",
  pizzip: "./_stubs/packages/pizzip/index.js",
  pdfmake: "./stubs/pdfmake.js",
  "pdfmake/build/pdfmake.js": "./stubs/pdfmake.js",
  "pdfmake/build/vfs_fonts.js": "./stubs/vfs_fonts.js",
  ajv: "./_stubs/packages/ajv/index.js",
  "ajv-formats": "./_stubs/packages/ajv-formats/index.js",
  openai: "./_stubs/packages/openai/index.js",
  mustache: "./_stubs/packages/mustache/index.js",
  "puppeteer-core": "./_stubs/packages/puppeteer-core/index.js",
  "@sparticuz/chromium": "./_stubs/packages/@sparticuz/chromium/index.js",
};

const LOADERS = [
  [".tsx", "tsx"],
  [".ts", "ts"],
  [".jsx", "jsx"],
  [".json", "json"],
];

export async function resolve(specifier, context, nextResolve) {
  const stubPath = STUB_MAP[specifier];
  if (stubPath) {
    return {
      url: new URL(stubPath, import.meta.url).href,
      shortCircuit: true,
    };
  }

  return nextResolve(specifier, context);
}

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
