// src/llm-ollama.js
// Ollama local LLM backend implementation for PromptOS.

import { extractJson } from './llm.js';

const DEFAULT_OLLAMA_HOST = 'http://localhost:11434';
const DEFAULT_MODEL = 'qwen2.5-coder';

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
 * Sends a generation request to the local Ollama HTTP server.
 * @param {string} prompt
 * @param {string} systemPrompt
 * @param {{ fetchFn?: Function, platform?: string, model?: string, host?: string }} context
 * @returns {Promise<string>}
 */
async function callOllama(prompt, systemPrompt, context = {}) {
  const host = (context.host || process.env.OLLAMA_HOST || DEFAULT_OLLAMA_HOST).replace(/\/+$/, '');
  const model = context.model || process.env.OLLAMA_MODEL || DEFAULT_MODEL;
  const fetchFn = context.fetchFn || globalThis.fetch;

  const url = `${host}/api/generate`;
  const body = {
    model,
    prompt,
    system: systemPrompt,
    stream: false,
    format: 'json',
  };

  let response;
  try {
    response = await fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || /fetch failed|ECONNREFUSED|connect/i.test(err.message)) {
      throw new Error(
        `Ollama server is not running or unreachable at ${host}.\nPlease install Ollama from https://ollama.com and start it by running "ollama serve".`
      );
    }
    throw err;
  }

  if (response.status === 404) {
    throw new Error(
      `Ollama model "${model}" was not found on server at ${host}.\nPlease run "ollama pull ${model}" in your terminal to download it.`
    );
  }

  const responseText = await response.text();
  let json;
  try {
    json = JSON.parse(responseText);
  } catch {
    throw new Error(`Invalid response from Ollama server:\n${responseText}`);
  }

  if (response.status !== 200 || json.error) {
    const errorMsg = json.error || `HTTP ${response.status}`;
    if (/model '.*' not found|not found/i.test(errorMsg)) {
      throw new Error(
        `Ollama model "${model}" was not found on server at ${host}.\nPlease run "ollama pull ${model}" in your terminal to download it.`
      );
    }
    throw new Error(`Ollama API error: ${errorMsg}`);
  }

  return json.response || '';
}

/**
 * @param {string} userPrompt
 * @param {{ cwd?: string, history?: string[], platform?: string, fetchFn?: Function }} context
 * @returns {Promise<{ summary: string, steps: {description: string, command: string}[], needsClarification?: boolean }>}
 */
export async function planFromPrompt(userPrompt, context = {}) {
  const contextBlock = [
    context.cwd ? `Current directory (project root): ${context.cwd}` : null,
    context.projectSummary ? `Project summary: ${context.projectSummary}` : null,
    context.recentPrompts?.length ? `Recent user prompts:\n${context.recentPrompts.map((p) => `- ${p}`).join('\n')}` : null,
    context.history?.length ? `Recent commands executed:\n${context.history.join('\n')}` : null,
  ]
    .filter(Boolean)
    .join('\n\n');

  const systemPrompt = buildSystemPrompt(context.platform || process.platform);
  const prompt = contextBlock ? `${contextBlock}\n\nRequest: ${userPrompt}` : `Request: ${userPrompt}`;

  const text = await callOllama(prompt, systemPrompt, context);

  try {
    return extractJson(text);
  } catch (err) {
    throw new Error(`Ollama model did not return valid JSON. Raw response:\n${text}`);
  }
}

/**
 * Ask Ollama to diagnose a failed command and propose a fix.
 * @param {string} command
 * @param {string} errorOutput
 * @param {{ platform?: string, fetchFn?: Function }} context
 */
export async function debugFailure(command, errorOutput, context = {}) {
  const systemPrompt = buildDebugSystemPrompt(context.platform || process.platform);
  const prompt = `Command: ${command}\n\nError output:\n${errorOutput}`;

  const text = await callOllama(prompt, systemPrompt, context);

  try {
    return extractJson(text);
  } catch {
    return { diagnosis: text, fixedCommand: '' };
  }
}
