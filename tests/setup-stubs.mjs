import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const stubRoot = path.join(__dirname, "_stubs", "packages");
const nodeModulesRoot = path.join(process.cwd(), "node_modules");

const stubPackages = [
  "pizzip",
  "docxtemplater",
  "pdfmake",
  "ajv",
  "ajv-formats",
  "openai",
];

const sentinelPath = path.join(nodeModulesRoot, ".stubs-ready");
const lockPath = path.join(nodeModulesRoot, ".stubs-lock");

await fs.mkdir(nodeModulesRoot, { recursive: true });

const sentinelExists = async () =>
  fs.access(sentinelPath)
    .then(() => true)
    .catch((error) => {
      if (error.code === "ENOENT") {
        return false;
      }

      throw error;
    });

const acquireLock = async () => {
  // Multiple Node test workers import this script concurrently. Acquire a lock
  // so only one worker performs the destructive package replacements at a time.
  // Use a simple file lock implemented via the O_EXCL flag provided by `open`.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const handle = await fs.open(lockPath, "wx");
      await handle.close();
      return;
    } catch (error) {
      if (error.code !== "EEXIST") {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
};

const releaseLock = async () => {
  await fs.rm(lockPath, { force: true });
};

const prepareStubs = async () => {
  if (await sentinelExists()) {
    return;
  }

  await acquireLock();

  try {
    if (await sentinelExists()) {
      return;
    }

    for (const pkg of stubPackages) {
      const parts = pkg.split("/");
      const source = path.join(stubRoot, ...parts);
      const target = path.join(nodeModulesRoot, ...parts);

      await fs.mkdir(path.dirname(target), { recursive: true });

      // Ensure the stub directory replaces any previously installed package
      // contents so imports consistently resolve to the lightweight test doubles.
      await fs.rm(target, { recursive: true, force: true });

      await fs.cp(source, target, { recursive: true, force: true });
    }

    await fs.writeFile(sentinelPath, "ready\n");
  } finally {
    await releaseLock();
  }
};

await prepareStubs();
