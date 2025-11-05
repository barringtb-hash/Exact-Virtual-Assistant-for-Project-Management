#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';
import process from 'process';

const repoRoot = process.cwd();

async function walkMarkdownFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return walkMarkdownFiles(fullPath);
      }
      if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        return [fullPath];
      }
      return [];
    })
  );
  return files.flat();
}

function isLocalLink(target) {
  if (!target) return false;
  const trimmed = target.trim();
  const lower = trimmed.toLowerCase();
  return !(
    lower.startsWith('http://') ||
    lower.startsWith('https://') ||
    lower.startsWith('mailto:') ||
    lower.startsWith('tel:') ||
    lower.startsWith('data:') ||
    lower.startsWith('#')
  );
}

function normalizeTarget(raw) {
  const noFragment = raw.split('#')[0];
  const noQuery = noFragment.split('?')[0];
  return noQuery.trim();
}

async function linkExists(resolvedPath) {
  try {
    const stats = await fs.stat(resolvedPath);
    return stats.isFile() || stats.isDirectory();
  } catch (error) {
    return false;
  }
}

async function validateFile(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  const contents = await fs.readFile(absolutePath, 'utf8');
  const dirName = path.dirname(relativePath);
  const linkRegex = /\[[^\]]*\]\(([^)]+)\)/g;
  const missing = [];

  for (const match of contents.matchAll(linkRegex)) {
    const target = match[1];
    if (!isLocalLink(target)) {
      continue;
    }
    const cleaned = normalizeTarget(target);
    if (!cleaned) {
      continue;
    }
    const candidate = cleaned.startsWith('/')
      ? cleaned.replace(/^\/+/, '')
      : path.normalize(path.join(dirName, cleaned));
    const resolved = path.join(repoRoot, candidate);
    // Allow anchor-only or same-file references (e.g., README.md#section) after normalization
    if (!candidate) {
      continue;
    }
    const exists = await linkExists(resolved);
    if (!exists) {
      missing.push({ link: target, file: relativePath });
    }
  }

  return missing;
}

async function main() {
  const markdownTargets = new Set(['README.md']);
  try {
    const docsFiles = await walkMarkdownFiles(path.join(repoRoot, 'docs'));
    docsFiles.forEach((absPath) => {
      const rel = path.relative(repoRoot, absPath);
      markdownTargets.add(rel);
    });
  } catch (error) {
    if (error.code === 'ENOENT') {
      // docs directory missing is acceptable, but log a warning.
      console.warn('No docs directory found to validate.');
    } else {
      throw error;
    }
  }

  const failures = [];
  for (const relativePath of markdownTargets) {
    const missing = await validateFile(relativePath);
    failures.push(...missing);
  }

  if (failures.length > 0) {
    console.error('Broken local links found:');
    for (const failure of failures) {
      console.error(`- ${failure.file} → ${failure.link}`);
    }
    process.exitCode = 1;
  } else {
    console.log(`All local Markdown links valid across ${markdownTargets.size} file(s).`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
