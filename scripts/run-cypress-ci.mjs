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

const runCypressSuite = async () => {
  await runCommand('npm', ['run', 'build']);

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
