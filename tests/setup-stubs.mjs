// Test bootstrap placeholder.
// We intentionally do not mutate node_modules here.
// Stubs are injected via the custom ESM loader (tests/jsx-loader.mjs).
// If you must manipulate files, always guard with exists and catch errors.
// Example pattern:
// import { access } from 'node:fs/promises';
// try { await access(somePath) /* ok */ } catch { /* not present: skip */ }
