import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { transform } from "esbuild";

export async function load(url, context, defaultLoad) {
  if (url.endsWith(".jsx")) {
    const fileUrl = url.startsWith("file:") ? url : pathToFileURL(url).href;
    const source = await readFile(new URL(fileUrl), "utf8");
    const result = await transform(source, {
      loader: "jsx",
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
