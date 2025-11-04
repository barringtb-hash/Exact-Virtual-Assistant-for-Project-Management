import { readFile } from "node:fs/promises";
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
