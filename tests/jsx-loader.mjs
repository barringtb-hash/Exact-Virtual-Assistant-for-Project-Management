import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { transform } from "esbuild";

const LOADERS = [
  [".tsx", "tsx"],
  [".ts", "ts"],
  [".jsx", "jsx"],
];

export async function load(url, context, defaultLoad) {
  // Stub CSS imports for Node.js test runner
  // CSS files are handled by the build system (Vite) in production
  if (url.endsWith(".css")) {
    return {
      format: "module",
      source: "export default {};",
      shortCircuit: true,
    };
  }

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
