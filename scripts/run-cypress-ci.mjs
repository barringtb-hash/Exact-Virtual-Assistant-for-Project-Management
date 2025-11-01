import { spawn } from 'node:child_process';
import process from 'node:process';

const runCommand = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: false,
      ...options,
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`${command} exited with signal ${signal}`));
        return;
      }

      if (code !== 0) {
        reject(new Error(`${command} exited with code ${code}`));
        return;
      }

      resolve(undefined);
    });
  });

const killPort = async (port) => {
  try {
    // Try to find and kill any process using the port
    const { execSync } = await import('node:child_process');
    try {
      // Use lsof to find the process, then kill it
      execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null || true`, {
        stdio: 'ignore',
      });
    } catch {
      // Ignore errors - port might not be in use
    }
  } catch {
    // Ignore errors
  }
};

const runCypressSuite = async () => {
  await runCommand('npm', ['run', 'build']);

  // Kill any existing process on port 5173
  await killPort(5173);

  const previewProcess = spawn(
    'npm',
    ['run', 'preview', '--', '--port', '5173', '--strictPort'],
    {
      stdio: 'inherit',
      shell: false,
    },
  );

  try {
    await runCommand('npx', ['--yes', 'wait-on', 'http://localhost:5173']);
    await runCommand('npx', ['--yes', 'cypress', 'run', '--config-file', 'cypress.config.ts']);
  } finally {
    if (!previewProcess.killed && previewProcess.exitCode === null) {
      previewProcess.kill('SIGTERM');
    }

    await new Promise((resolve) => {
      if (previewProcess.exitCode !== null) {
        resolve(undefined);
        return;
      }

      previewProcess.on('exit', () => resolve(undefined));
      previewProcess.on('error', () => resolve(undefined));
    });
  }
};

runCypressSuite().catch((error) => {
  console.error(error);
  process.exit(1);
});
