// src/templates/index.js
// Central repository for PromptOS scaffolding templates

import react from './react.js';
import expressApi from './express-api.js';
import fastapi from './fastapi.js';
import nextjs from './nextjs.js';

export const templates = [react, expressApi, fastapi, nextjs];

/**
 * Find template by exact name or alias.
 * @param {string} name
 * @returns {object|null}
 */
export function getTemplateByName(name) {
  if (!name) return null;
  const normalized = name.toLowerCase().trim();
  return templates.find(
    (t) => t.name === normalized || t.aliases.includes(normalized)
  ) || null;
}

/**
 * Match user prompt against template intent patterns.
 * @param {string} prompt
 * @returns {object|null}
 */
export function matchTemplateFromPrompt(prompt) {
  if (!prompt) return null;
  const trimmed = prompt.trim();
  for (const template of templates) {
    for (const pattern of template.matchPatterns) {
      if (pattern.test(trimmed)) {
        return template;
      }
    }
  }
  return null;
}
