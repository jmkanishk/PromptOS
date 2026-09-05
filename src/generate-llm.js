// src/generate-llm.js
// LLM engine for generating full React website projects from natural language descriptions.

import { GoogleGenerativeAI } from '@google/generative-ai';
import { extractJson, withRetry } from './llm.js';

const PROTECTED_FILES = ['package.json', 'vite.config.js', 'index.html', 'eslint.config.js'];

function shellDescriptionFor(platform) {
  if (platform === 'win32') {
    return `Generate Windows PowerShell compatible React files.`;
  }
  return `Generate Linux/Unix compatible React files.`;
}

function buildGenerateSystemPrompt(platform) {
  return `You are PromptOS's React website scaffolding engine. Given a user's natural-language
description of a website or web application, generate complete, working React component files.

Rules:
- Respond ONLY with valid JSON. No markdown fences, no prose, no preamble.
- JSON shape:
  {
    "projectName": "portfolio-app",
    "framework": "vite-react",
    "files": [
      { "path": "src/App.jsx", "content": "...complete code..." },
      { "path": "src/components/Hero.jsx", "content": "...complete code..." }
    ],
    "dependencies": ["react-icons"]
  }
- Write complete, production-ready React functional components (no placeholder comments, no "TODO", no truncated code).
- Use consistent styling across files (inline CSS objects, standard CSS in src/App.css or src/index.css, or Tailwind classes).
- Include all necessary React imports (useState, useEffect, icons, etc.) so the app runs error-free when served by Vite.
- Cap the total number of files at a maximum of 12 files.
- DO NOT generate config files (no package.json, no vite.config.js, no index.html, no eslint.config.js). Extra npm packages must ONLY be listed in the "dependencies" array as package name strings.
- ${shellDescriptionFor(platform)}`;
}

/**
 * Filter out any protected scaffolding configuration files from the file list.
 * @param {Array<{path: string, content: string}>} files
 * @returns {Array<{path: string, content: string}>}
 */
export function sanitizeFiles(files) {
  if (!Array.isArray(files)) return [];
  return files.filter((file) => {
    if (!file || !file.path) return false;
    const baseName = file.path.split(/[/\\]/).pop().toLowerCase();
    return !PROTECTED_FILES.includes(baseName);
  });
}

/**
 * Generates a full React website project structure from a prompt description.
 * @param {string} userPrompt
 * @param {{ cwd?: string, platform?: string, client?: object, fetchFn?: Function }} context
 * @returns {Promise<{ projectName: string, framework: string, files: Array<{path: string, content: string}>, dependencies: string[] }>}
 */
export async function generateProject(userPrompt, context = {}) {
  const requestedBackend = (process.env.LLM_BACKEND || 'gemini').toLowerCase();
  const systemPrompt = buildGenerateSystemPrompt(context.platform || process.platform);

  let rawText = '';

  if (requestedBackend === 'ollama') {
    rawText = await callOllamaGenerate(userPrompt, systemPrompt, context);
  } else if (process.env.GEMINI_API_KEY || context.client) {
    try {
      rawText = await callGeminiGenerate(userPrompt, systemPrompt, context);
    } catch (err) {
      const isTransient = /503|429|overloaded|rate limit|fetch failed|connect/i.test(err.message);
      if (isTransient) {
        console.warn('Gemini API transient error during project generation. Falling back to local Ollama...');
        rawText = await callOllamaGenerate(userPrompt, systemPrompt, context);
      } else {
        throw err;
      }
    }
  } else {
    console.warn('GEMINI_API_KEY is not set. Falling back to local Ollama for project generation...');
    rawText = await callOllamaGenerate(userPrompt, systemPrompt, context);
  }

  const parsed = extractJson(rawText);
  return {
    projectName: parsed.projectName || 'promptos-app',
    framework: parsed.framework || 'vite-react',
    files: sanitizeFiles(parsed.files),
    dependencies: Array.isArray(parsed.dependencies) ? parsed.dependencies : [],
  };
}

async function callGeminiGenerate(prompt, systemPrompt, context) {
  const client = context.client || new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = client.getGenerativeModel({
    model: 'gemini-flash-latest',
    systemInstruction: systemPrompt,
    generationConfig: { responseMimeType: 'application/json' },
  });

  const res = await withRetry(() => model.generateContent(`Request: ${prompt}`));
  return res.response.text().trim();
}

async function callOllamaGenerate(prompt, systemPrompt, context) {
  const host = (context.host || process.env.OLLAMA_HOST || 'http://localhost:11434').replace(/\/+$/, '');
  const model = context.model || process.env.OLLAMA_MODEL || 'qwen2.5-coder';
  const fetchFn = context.fetchFn || globalThis.fetch;

  const url = `${host}/api/generate`;
  const body = {
    model,
    prompt: `Request: ${prompt}`,
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
  const json = JSON.parse(responseText);
  return json.response || '';
}
