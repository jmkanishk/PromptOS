// src/llm.js
// Talks to the LLM (Google Gemini, free tier) and forces it to return a structured plan.

import { GoogleGenerativeAI } from '@google/generative-ai';

// gemini-flash-latest is an alias that always points at Google's current stable Flash
// model, on the free tier. Using the alias (instead of pinning a version like
// "gemini-1.5-flash" or "gemini-2.5-flash") avoids the code breaking every time Google
// retires an old model and ships a new one, which happens every few months.
const MODEL_NAME = 'gemini-flash-latest';

function getClient(context) {
  if (context.genAI || context.client) {
    return context.genAI || context.client;
  }
  return new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
}

function shellDescriptionFor(platform) {
  if (platform === 'win32') {
    return `The user is on Windows. Generate PowerShell-compatible commands ONLY.
- Do NOT use bash syntax: no "&&" for chaining (use ";" or separate steps instead, since
  older PowerShell doesn't support &&), no heredocs ("<<"), no "~" for home directory
  (use $HOME or %USERPROFILE% as appropriate), no "rm -rf" (use "Remove-Item -Recurse -Force").
- Use standard PowerShell cmdlets (New-Item, Remove-Item, Copy-Item, etc.) or cross-platform
  CLI tools (npm, npx, git, python) which work the same on Windows.
- npx/npm/git/python commands work as-is on Windows and are preferred over PowerShell-native
  equivalents when a cross-platform tool exists.`;
  }
  return `The user is on a standard Ubuntu/Debian-based Linux environment with bash, node,
npm, python3, and git. Generate bash-compatible commands.`;
}

function buildSystemPrompt(platform) {
  return `You are PromptOS's planning engine. You convert a user's natural-language
request into a short, ordered list of shell steps to accomplish it.

Rules:
- Respond ONLY with valid JSON. No markdown fences, no prose, no preamble.
- JSON shape:
  {
    "summary": "one sentence describing the overall plan",
    "steps": [
      { "description": "what this step does", "command": "the exact shell command" }
    ]
  }
- Prefer the smallest number of steps that safely accomplishes the goal.
- Never invent destructive commands (no recursive force-deletes of root/home, no piping
  curl/wget to a shell, no raw disk writes).
- If the request is ambiguous or you need a decision only the user can make (e.g. which
  framework, which port), ask by returning a single step with command set to "" and the
  description phrased as a clarifying question, and set "needsClarification": true at the
  top level.
- If detected project context is provided, strictly prefer using actual detected package.json scripts (e.g. "<packageManager> run <script>" if script exists) and detected package manager commands over guessing generic commands.
- If Git repository is NOT initialized and the user requests git actions (like "push changes" or "commit"), suggest "git init" first before "git add" / "git commit" / "git push".
- ${shellDescriptionFor(platform)}
- Current working directory and recent context will be provided; treat it as the project
  root — create new files/folders relative to it, don't assume any other location.`;
}

function buildDebugSystemPrompt(platform) {
  return `You are a Linux/Windows debugging assistant. Given a failed command and its error
output, respond ONLY with JSON: { "diagnosis": "...", "fixedCommand": "..." }. If no safe fix is
obvious, set fixedCommand to "". ${shellDescriptionFor(platform)}`;
}

/**
 * Formats a detected project summary object for context injection.
 * @param {{ type: string, scripts?: object, packageManager?: string, gitInitialized?: boolean }} dp
 * @returns {string|null}
 */
export function formatDetectedProject(dp) {
  if (!dp) return null;
  if (dp.type === 'unknown') {
    return dp.gitInitialized === false ? 'Git repository status: .git repository NOT initialized in current directory' : null;
  }
  const parts = [`Project type: ${dp.type}`];
  if (dp.type === 'node' && dp.scripts) {
    const scriptKeys = Object.keys(dp.scripts);
    if (scriptKeys.length > 0) {
      parts.push(`Available package.json scripts: ${scriptKeys.join(', ')}`);
    }
    parts.push(`Package manager: ${dp.packageManager || 'npm'}`);
  }
  parts.push(`Git repository initialized: ${dp.gitInitialized ? 'yes' : 'no'}`);
  return `Detected project context:\n- ${parts.join('\n- ')}`;
}

/**
 * Extracts JSON object from raw or markdown-fenced response text.
 * @param {string} text
 * @returns {object}
 */
export function extractJson(text) {
  // Gemini sometimes wraps JSON in markdown fences despite instructions; strip them.
  const cleaned = text.replace(/^```(?:json)?\s*|```$/gm, '').trim();
  return JSON.parse(cleaned);
}

const RETRYABLE_STATUS = [429, 503];
const MAX_RETRIES = 4;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getStatusCode(err) {
  // The SDK's error message embeds the status like "[503 Service Unavailable] ...".
  const match = /\[(\d{3})\s/.exec(err?.message || '');
  return match ? Number(match[1]) : null;
}

/**
 * Runs an LLM call with exponential backoff on 429 (rate limit) and 503 (overloaded)
 * responses, which are common and transient on Gemini's free tier.
 * @param {Function} fn
 * @param {number} [maxRetries=4]
 * @param {Function} [sleepFn=sleep]
 */
export async function withRetry(fn, maxRetries = MAX_RETRIES, sleepFn = sleep) {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await fn();
    } catch (err) {
      const status = getStatusCode(err);
      attempt += 1;
      if (!RETRYABLE_STATUS.includes(status) || attempt > maxRetries) {
        throw err;
      }
      const delayMs = Math.min(1000 * 2 ** (attempt - 1), 15000);
      console.error(
        `  (${status === 503 ? 'model overloaded' : 'rate limited'}, retrying in ${Math.round(delayMs / 1000)}s — attempt ${attempt}/${maxRetries})`
      );
      await sleepFn(delayMs);
    }
  }
}

/**
 * @param {string} userPrompt
 * @param {{ cwd?: string, history?: string[], platform?: string, genAI?: object, client?: object, projectSummary?: string, detectedProject?: object }} context
 * @returns {Promise<{ summary: string, steps: {description: string, command: string}[], needsClarification?: boolean }>}
 */
export async function planFromPrompt(userPrompt, context = {}) {
  const contextBlock = [
    context.cwd ? `Current directory (project root): ${context.cwd}` : null,
    context.projectSummary ? `Project summary: ${context.projectSummary}` : null,
    context.detectedProject ? formatDetectedProject(context.detectedProject) : null,
    context.recentPrompts?.length ? `Recent user prompts:\n${context.recentPrompts.map((p) => `- ${p}`).join('\n')}` : null,
    context.history?.length ? `Recent commands executed:\n${context.history.join('\n')}` : null,
  ]
    .filter(Boolean)
    .join('\n\n');

  const client = getClient(context);
  const model = client.getGenerativeModel({
    model: MODEL_NAME,
    systemInstruction: buildSystemPrompt(context.platform || process.platform),
    generationConfig: { responseMimeType: 'application/json' },
  });

  const prompt = contextBlock ? `${contextBlock}\n\nRequest: ${userPrompt}` : `Request: ${userPrompt}`;

  const result = await withRetry(() => model.generateContent(prompt));
  const text = result.response.text().trim();

  try {
    return extractJson(text);
  } catch (err) {
    throw new Error(`LLM did not return valid JSON. Raw response:\n${text}`);
  }
}

/**
 * Ask the LLM to diagnose a failed command and propose a fix.
 * @param {string} command
 * @param {string} errorOutput
 * @param {{ platform?: string, genAI?: object, client?: object }} context
 */
export async function debugFailure(command, errorOutput, context = {}) {
  const client = getClient(context);
  const model = client.getGenerativeModel({
    model: MODEL_NAME,
    systemInstruction: buildDebugSystemPrompt(context.platform || process.platform),
    generationConfig: { responseMimeType: 'application/json' },
  });

  const result = await withRetry(() =>
    model.generateContent(`Command: ${command}\n\nError output:\n${errorOutput}`)
  );
  const text = result.response.text().trim();

  try {
    return extractJson(text);
  } catch {
    return { diagnosis: text, fixedCommand: '' };
  }
}
