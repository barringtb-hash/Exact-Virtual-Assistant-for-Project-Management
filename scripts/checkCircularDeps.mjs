#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const SRC_DIR = path.resolve(process.cwd(), 'src');
const EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx']);

function isSourceFile(filePath) {
  const ext = path.extname(filePath);
  return EXTENSIONS.has(ext);
}

function readDirRecursive(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...readDirRecursive(fullPath));
    } else if (entry.isFile() && isSourceFile(fullPath)) {
      files.push(fullPath);
    }
  }
  return files;
}

function normalizeSpecifier(specifier) {
  if (!specifier) return '';
  return specifier.replace(/['"`]/g, '').split('?')[0].trim();
}

function resolveImport(fromFile, specifier) {
  if (!specifier) return null;
  if (!specifier.startsWith('.')) {
    // ignore bare imports outside src
    return null;
  }
  const basePath = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [];
  if (EXTENSIONS.has(path.extname(basePath))) {
    candidates.push(basePath);
  } else {
    for (const ext of EXTENSIONS) {
      candidates.push(basePath + ext);
    }
    candidates.push(path.join(basePath, 'index.js'));
    candidates.push(path.join(basePath, 'index.jsx'));
    candidates.push(path.join(basePath, 'index.ts'));
    candidates.push(path.join(basePath, 'index.tsx'));
  }
  for (const candidate of candidates) {
    const normalized = candidate.startsWith(SRC_DIR)
      ? candidate
      : null;
    if (normalized && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return path.relative(SRC_DIR, candidate);
    }
  }
  return null;
}

function collectImports(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const matches = [];
  const importRegex = /import\s+(?:[^'";]+?from\s+)?(["'`][^"'`]+["'`])/g;
  const exportRegex = /export\s+(?:[^'";]+?from\s+)(["'`][^"'`]+["'`])/g;
  const dynamicRegex = /import\s*\(\s*(["'`][^"'`]+["'`])/g;
  let match;
  while ((match = importRegex.exec(content))) {
    matches.push(normalizeSpecifier(match[1]));
  }
  while ((match = exportRegex.exec(content))) {
    matches.push(normalizeSpecifier(match[1]));
  }
  while ((match = dynamicRegex.exec(content))) {
    matches.push(normalizeSpecifier(match[1]));
  }
  const imports = new Set();
  for (const specifier of matches) {
    const resolved = resolveImport(filePath, specifier);
    if (resolved) {
      imports.add(resolved);
    }
  }
  return Array.from(imports);
}

function buildGraph() {
  const graph = new Map();
  const files = readDirRecursive(SRC_DIR);
  for (const file of files) {
    const from = path.relative(SRC_DIR, file);
    const imports = collectImports(file);
    graph.set(from, imports);
  }
  return graph;
}

function findCycles(graph) {
  const visited = new Set();
  const stack = new Set();
  const cycles = [];

  function dfs(node, path) {
    visited.add(node);
    stack.add(node);
    path.push(node);

    const neighbors = graph.get(node) || [];
    for (const neighbor of neighbors) {
      if (!graph.has(neighbor)) {
        continue;
      }
      if (!visited.has(neighbor)) {
        dfs(neighbor, path);
      } else if (stack.has(neighbor)) {
        const cycleStart = path.indexOf(neighbor);
        if (cycleStart !== -1) {
          const cycle = path.slice(cycleStart);
          cycle.push(neighbor);
          const signature = cycle.join('->');
          if (!cycles.some((existing) => existing.signature === signature)) {
            cycles.push({ cycle, signature });
          }
        }
      }
    }

    stack.delete(node);
    path.pop();
  }

  for (const node of graph.keys()) {
    if (!visited.has(node)) {
      dfs(node, []);
    }
  }

  return cycles.map(({ cycle }) => cycle);
}

const graph = buildGraph();
const cycles = findCycles(graph);

if (cycles.length === 0) {
  console.log('No circular dependencies found.');
  process.exit(0);
}

console.log('Circular dependencies detected:');
cycles.forEach((cycle, index) => {
  const formatted = cycle.join(' -> ');
  console.log(`${index + 1}. ${formatted}`);
});
process.exit(1);
