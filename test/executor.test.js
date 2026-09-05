// test/executor.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCommand } from '../src/executor.js';

test('executor: runCommand basic execution', async (t) => {
  await t.test('executes simple command successfully', async () => {
    const cmd = process.platform === 'win32' ? 'Write-Output "hello world"' : 'echo "hello world"';
    const result = await runCommand(cmd, { timeout: 10000 });

    assert.equal(result.success, true);
    assert.match(result.output, /hello world/);
    assert.equal(result.code, 0);
  });

  await t.test('reports failure for invalid commands', async () => {
    const cmd = 'nonexistent_command_12345';
    const result = await runCommand(cmd, { timeout: 10000 });

    assert.equal(result.success, false);
    assert.notEqual(result.code, 0);
  });
});

test('executor: stdin ignore and timeout handling', async (t) => {
  await t.test('kills hanging command when timeout is reached', async () => {
    const cmd = process.platform === 'win32'
      ? 'Start-Sleep -Seconds 10'
      : 'sleep 10';

    const startTime = Date.now();
    const result = await runCommand(cmd, { timeout: 100 });
    const duration = Date.now() - startTime;

    assert.equal(result.success, false);
    assert.equal(result.timedOut, true);
    assert.match(result.output, /Command timed out after 0s, possibly waiting on interactive input/);
    assert.ok(duration < 5000); // Resolves quickly on timeout
  });
});
