#!/usr/bin/env node
/**
 * Build script for server-side TypeScript files
 * Compiles TypeScript files in server/ directory and MCP servers to JavaScript using esbuild
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist', 'server');
const mcpDistDir = path.join(rootDir, 'dist', 'mcp-servers');

console.log('Building server-side TypeScript files...');

// Clean dist directories
if (fs.existsSync(distDir)) {
  console.log('Cleaning dist/server directory...');
  fs.rmSync(distDir, { recursive: true, force: true });
}

if (fs.existsSync(mcpDistDir)) {
  console.log('Cleaning dist/mcp-servers directory...');
  fs.rmSync(mcpDistDir, { recursive: true, force: true });
}

// Entry point for charter extraction module
const entryPoint = path.join(rootDir, 'server/charter/extractFieldsFromUtterance.ts');

// Verify entry point exists
if (!fs.existsSync(entryPoint)) {
  console.error(`✗ Entry point not found: ${entryPoint}`);
  process.exit(1);
}

console.log('Compiling server TypeScript files with esbuild...');

// Build esbuild command for server files
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

// Build MCP servers
console.log('\nBuilding MCP servers...');

const mcpServers = [
  { name: 'exact-va', entry: 'mcp-servers/exact-va/index.ts' },
  { name: 'smartsheet', entry: 'mcp-servers/smartsheet/index.ts' },
  { name: 'office365', entry: 'mcp-servers/office365/index.ts' },
];

for (const server of mcpServers) {
  const entryPath = path.join(rootDir, server.entry);

  if (!fs.existsSync(entryPath)) {
    console.log(`⚠ MCP server '${server.name}' not found at ${server.entry}, skipping`);
    continue;
  }

  const outDir = path.join(mcpDistDir, server.name);

  // Build command for MCP server
  // We bundle each server with its dependencies but keep node_modules external
  const mcpCmd = [
    'npx esbuild',
    `"${entryPath}"`,
    `--outdir="${outDir}"`,
    '--format=esm',
    '--platform=node',
    '--target=es2022',
    '--bundle',
    '--packages=external',
    '--loader:.ts=ts'
  ].join(' ');

  try {
    execSync(mcpCmd, {
      cwd: rootDir,
      stdio: 'inherit'
    });
    console.log(`✓ Compiled MCP server: ${server.name}`);
  } catch (error) {
    console.error(`✗ Failed to compile MCP server '${server.name}'`);
    // Continue with other servers instead of failing completely
  }
}

console.log('\n✓ All builds complete');
