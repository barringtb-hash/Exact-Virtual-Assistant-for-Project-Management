#!/usr/bin/env node
/**
 * Build script for server-side TypeScript files
 * Compiles TypeScript files in server/ directory to JavaScript using esbuild
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist', 'server');

console.log('Building server-side TypeScript files...');

// Clean dist directory
if (fs.existsSync(distDir)) {
  console.log('Cleaning dist/server directory...');
  fs.rmSync(distDir, { recursive: true, force: true });
}

// Entry point for charter extraction module
const entryPoint = path.join(rootDir, 'server/charter/extractFieldsFromUtterance.ts');

// Verify entry point exists
if (!fs.existsSync(entryPoint)) {
  console.error(`✗ Entry point not found: ${entryPoint}`);
  process.exit(1);
}

console.log('Compiling server TypeScript files with esbuild...');

// Build esbuild command
// Note: We bundle the file to resolve all TypeScript dependencies
// but keep external packages (node_modules) external
const cmd = [
  'npx esbuild',
  `"${entryPoint}"`,
  `--outdir="${distDir}"`,
  `--outbase="${rootDir}"`,
  '--format=esm',
  '--platform=node',
  '--target=es2022',
  '--bundle',
  '--packages=external',
  '--loader:.ts=ts'
].join(' ');

// Compile TypeScript files using esbuild CLI
try {
  execSync(cmd, {
    cwd: rootDir,
    stdio: 'inherit'
  });

  const outputPath = path.join(distDir, 'server/charter/extractFieldsFromUtterance.js');
  console.log('✓ Server TypeScript compilation complete');
  console.log(`✓ Compiled: ${path.relative(rootDir, entryPoint)} → ${path.relative(rootDir, outputPath)}`);
} catch (error) {
  console.error('✗ TypeScript compilation failed');
  process.exit(1);
}
