#!/usr/bin/env node
import * as esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

async function buildServer() {
  try {
    console.log('Building server TypeScript files...');

    // Build to dist/server for development
    await esbuild.build({
      entryPoints: [
        resolve(projectRoot, 'server/charter/extractFieldsFromUtterance.ts')
      ],
      bundle: true,
      platform: 'node',
      target: 'node22',
      format: 'esm',
      outdir: resolve(projectRoot, 'dist/server/charter'),
      outExtension: { '.js': '.mjs' },
      external: ['openai'],
      sourcemap: true,
      minify: false,
      packages: 'external',
    });

    // Also build to api/_lib for Vercel deployment
    await esbuild.build({
      entryPoints: [
        resolve(projectRoot, 'server/charter/extractFieldsFromUtterance.ts')
      ],
      bundle: true,
      platform: 'node',
      target: 'node22',
      format: 'esm',
      outdir: resolve(projectRoot, 'api/_lib/charter'),
      outExtension: { '.js': '.mjs' },
      external: ['openai'],
      sourcemap: true,
      minify: false,
      packages: 'external',
    });

    console.log('✓ Server build complete');
  } catch (error) {
    console.error('Server build failed:', error);
    process.exit(1);
  }
}

buildServer();
