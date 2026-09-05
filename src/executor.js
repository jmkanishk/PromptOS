// src/executor.js
// Runs an approved shell command, streaming output live, and reports success/failure.

import { spawn } from 'child_process';

// On Windows, `shell: true` defaults to cmd.exe, but PromptOS asks the LLM to generate
// PowerShell-compatible commands — so we need to explicitly run through PowerShell to match.
const WINDOWS_SHELL = 'powershell.exe';

/**
 * @param {string} command
 * @param {{ cwd?: string, timeout?: number }} options
 * @returns {Promise<{ success: boolean, output: string, code: number, timedOut?: boolean }>}
 */
export function runCommand(command, options = {}) {
  return new Promise((resolve) => {
    const timeoutMs = options.timeout ?? 60000;
    let resolved = false;
    let timedOut = false;
    let timer = null;

    const child = spawn(command, {
      shell: process.platform === 'win32' ? WINDOWS_SHELL : true,
      cwd: options.cwd || process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';

    const cleanupAndResolve = (result) => {
      if (resolved) return;
      resolved = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    };

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        try {
          child.kill('SIGTERM');
        } catch {
          // Ignore kill errors
        }
        const timeoutSeconds = Math.round(timeoutMs / 1000);
        const errMsg = `\nCommand timed out after ${timeoutSeconds}s, possibly waiting on interactive input.`;
        output += errMsg;
        process.stderr.write(errMsg + '\n');
        cleanupAndResolve({ success: false, output, code: -1, timedOut: true });
      }, timeoutMs);
    }

    child.stdout.on('data', (chunk) => {
      process.stdout.write(chunk);
      output += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      process.stderr.write(chunk);
      output += chunk.toString();
    });

    child.on('close', (code) => {
      cleanupAndResolve({ success: code === 0 && !timedOut, output, code: code ?? -1 });
    });

    child.on('error', (err) => {
      output += `\n${err.message}`;
      cleanupAndResolve({ success: false, output, code: -1 });
    });
  });
}
