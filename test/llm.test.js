// test/llm.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractJson, withRetry, planFromPrompt, debugFailure } from '../src/llm.js';

test('llm: extractJson parsing', async (t) => {
  await t.test('parses raw JSON text', () => {
    const raw = '{"summary": "Test plan", "steps": []}';
    const parsed = extractJson(raw);
    assert.deepEqual(parsed, { summary: 'Test plan', steps: [] });
  });

  await t.test('parses markdown-fenced json text', () => {
    const fenced = '```json\n{"summary": "Vite React app", "steps": [{"command": "npm i"}]}\n```';
    const parsed = extractJson(fenced);
    assert.equal(parsed.summary, 'Vite React app');
    assert.equal(parsed.steps.length, 1);
  });

  await t.test('parses generic markdown-fenced text without json language tag', () => {
    const generic = '```\n{"summary": "Generic fence", "steps": []}\n```';
    const parsed = extractJson(generic);
    assert.equal(parsed.summary, 'Generic fence');
  });

  await t.test('handles whitespace surrounding json text', () => {
    const padded = '\n\n  {"summary": "Padded", "steps": []}  \n';
    const parsed = extractJson(padded);
    assert.equal(parsed.summary, 'Padded');
  });
});

test('llm: withRetry backoff and error handling', async (t) => {
  const instantSleep = async () => {};

  await t.test('returns value on first successful call', async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls += 1;
      return 'success';
    }, 4, instantSleep);

    assert.equal(result, 'success');
    assert.equal(calls, 1);
  });

  await t.test('retries on 503 and 429 status errors until success', async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls += 1;
      if (calls === 1) throw new Error('[503 Service Unavailable] Overloaded');
      if (calls === 2) throw new Error('[429 Too Many Requests] Rate limit');
      return 'recovered';
    }, 4, instantSleep);

    assert.equal(result, 'recovered');
    assert.equal(calls, 3);
  });

  await t.test('throws immediately on non-retryable error (e.g. 401)', async () => {
    let calls = 0;
    await assert.rejects(
      async () => {
        await withRetry(async () => {
          calls += 1;
          throw new Error('[401 Unauthorized] Invalid API key');
        }, 4, instantSleep);
      },
      (err) => {
        assert.match(err.message, /401/);
        return true;
      }
    );

    assert.equal(calls, 1);
  });

  await t.test('throws after exceeding maxRetries', async () => {
    let calls = 0;
    await assert.rejects(
      async () => {
        await withRetry(async () => {
          calls += 1;
          throw new Error('[429 Too Many Requests] Rate limit');
        }, 2, instantSleep);
      },
      (err) => {
        assert.match(err.message, /429/);
        return true;
      }
    );

    assert.equal(calls, 3); // Initial attempt (1) + 2 retries
  });
});

test('llm: planFromPrompt and debugFailure with mocked client', async (t) => {
  await t.test('planFromPrompt parses mocked LLM plan', async () => {
    const mockClient = {
      getGenerativeModel: () => ({
        generateContent: async (prompt) => {
          assert.match(prompt, /create a react app/);
          return {
            response: {
              text: () => '```json\n{"summary": "Mock React Plan", "steps": [{"description": "Init", "command": "npx create-vite"}]}\n```',
            },
          };
        },
      }),
    };

    const plan = await planFromPrompt('create a react app', { client: mockClient });
    assert.equal(plan.summary, 'Mock React Plan');
    assert.equal(plan.steps.length, 1);
    assert.equal(plan.steps[0].command, 'npx create-vite');
  });

  await t.test('debugFailure parses mocked LLM diagnosis', async () => {
    const mockClient = {
      getGenerativeModel: () => ({
        generateContent: async (prompt) => {
          assert.match(prompt, /npm ERR!/);
          return {
            response: {
              text: () => '{"diagnosis": "Missing package.json", "fixedCommand": "npm init -y"}',
            },
          };
        },
      }),
    };

    const debug = await debugFailure('npm install', 'npm ERR! enoent', { client: mockClient });
    assert.equal(debug.diagnosis, 'Missing package.json');
    assert.equal(debug.fixedCommand, 'npm init -y');
  });
});
