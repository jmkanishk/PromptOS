// src/config.js
// Loads PromptOS configuration from .promptosrc.json or ~/.promptos/config.json

import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Safely compiles a pattern string into a RegExp object.
 * Logs a warning and returns null if compilation fails.
 * @param {string} patternStr
 * @param {string} type - 'allowlist' or 'denylist'
 * @returns {RegExp|null}
 */
function compilePattern(patternStr, type) {
  if (!patternStr || typeof patternStr !== 'string') return null;
  try {
    return new RegExp(patternStr, 'i');
  } catch (err) {
    console.warn(`[PromptOS Config Warning] Invalid regular expression in ${type}: "${patternStr}" - ${err.message}`);
    return null;
  }
}

/**
 * Loads raw config JSON from a file if it exists.
 * Returns null if file does not exist or fails to parse.
 * @param {string} filePath
 * @returns {object|null}
 */
function loadConfigFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.warn(`[PromptOS Config Warning] Failed to parse config file at "${filePath}": ${err.message}`);
  }
  return null;
}

/**
 * Loads and merges PromptOS configuration for the given working directory.
 * Priority: Project config (.promptosrc.json) > Global config (~/.promptos/config.json)
 *
 * @param {string} [workDir]
 * @returns {{ allowlist: RegExp[], denylist: RegExp[], autoApprove: boolean }}
 */
export function loadConfig(workDir) {
  const globalPath = path.join(os.homedir(), '.promptos', 'config.json');
  const projectPath = path.join(workDir || process.cwd(), '.promptosrc.json');

  const globalConfig = loadConfigFile(globalPath) || {};
  const projectConfig = loadConfigFile(projectPath) || {};

  const rawAllowlist = [
    ...(Array.isArray(globalConfig.allowlist) ? globalConfig.allowlist : []),
    ...(Array.isArray(projectConfig.allowlist) ? projectConfig.allowlist : []),
  ];

  const rawDenylist = [
    ...(Array.isArray(globalConfig.denylist) ? globalConfig.denylist : []),
    ...(Array.isArray(projectConfig.denylist) ? projectConfig.denylist : []),
  ];

  const autoApprove = Boolean(
    projectConfig.autoApprove !== undefined
      ? projectConfig.autoApprove
      : globalConfig.autoApprove !== undefined
      ? globalConfig.autoApprove
      : false
  );

  const allowlist = rawAllowlist
    .map((p) => compilePattern(p, 'allowlist'))
    .filter(Boolean);

  const denylist = rawDenylist
    .map((p) => compilePattern(p, 'denylist'))
    .filter(Boolean);

  return {
    allowlist,
    denylist,
    autoApprove,
  };
}
