// src/session.js
// Per-project session memory persistence in .promptos/session.json

import fs from 'fs';
import path from 'path';

const SESSION_DIR = '.promptos';
const SESSION_FILE = 'session.json';
const MAX_RECENT_COMMANDS = 20;
const MAX_RECENT_PROMPTS = 10;

/**
 * Returns absolute path to session file for a directory.
 * @param {string} dir
 * @returns {string}
 */
function getSessionFilePath(dir) {
  return path.join(dir, SESSION_DIR, SESSION_FILE);
}

/**
 * Loads session memory for the specified directory.
 * @param {string} dir
 * @returns {{ projectSummary: string, recentPrompts: string[], recentCommands: string[] }}
 */
export function loadSession(dir) {
  const filePath = getSessionFilePath(dir);
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(content);
      return {
        projectSummary: typeof data.projectSummary === 'string' ? data.projectSummary : '',
        recentPrompts: Array.isArray(data.recentPrompts) ? data.recentPrompts : [],
        recentCommands: Array.isArray(data.recentCommands) ? data.recentCommands : [],
      };
    }
  } catch (err) {
    // Fall back to empty session on read/parse error
  }
  return { projectSummary: '', recentPrompts: [], recentCommands: [] };
}

/**
 * Appends .promptos/ to .gitignore if .gitignore exists in dir and doesn't already contain .promptos.
 * Does NOT create a .gitignore file if none exists.
 * @param {string} dir
 */
function ensureGitignoreUpdated(dir) {
  const gitignorePath = path.join(dir, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    try {
      const content = fs.readFileSync(gitignorePath, 'utf8');
      if (!/\b\.promptos\b/.test(content)) {
        const trailingNewline = content.endsWith('\n') || content.length === 0 ? '' : '\n';
        fs.appendFileSync(gitignorePath, `${trailingNewline}.promptos/\n`);
      }
    } catch (err) {
      // Ignore gitignore write errors silently
    }
  }
}

/**
 * Saves session data to .promptos/session.json in dir.
 * @param {string} dir
 * @param {{ projectSummary: string, recentPrompts: string[], recentCommands: string[] }} sessionData
 */
export function saveSession(dir, sessionData) {
  const sessionDir = path.join(dir, SESSION_DIR);
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  ensureGitignoreUpdated(dir);

  const filePath = getSessionFilePath(dir);
  const content = JSON.stringify(sessionData, null, 2);
  fs.writeFileSync(filePath, content, 'utf8');
}

/**
 * Updates session data after a run and saves to disk.
 * @param {string} dir
 * @param {{ prompt?: string, executedCommands?: string[], summary?: string }} update
 */
export function updateSession(dir, { prompt, executedCommands = [], summary }) {
  const current = loadSession(dir);

  const newPrompts = [...current.recentPrompts];
  if (prompt && prompt.trim()) {
    newPrompts.push(prompt.trim());
  }
  const recentPrompts = newPrompts.slice(-MAX_RECENT_PROMPTS);

  const newCommands = [...current.recentCommands];
  if (Array.isArray(executedCommands)) {
    for (const cmd of executedCommands) {
      if (cmd && typeof cmd === 'string') {
        newCommands.push(cmd.trim());
      }
    }
  }
  const recentCommands = newCommands.slice(-MAX_RECENT_COMMANDS);

  const projectSummary = (summary && typeof summary === 'string' && summary.trim())
    ? summary.trim()
    : current.projectSummary;

  const updatedSession = {
    projectSummary,
    recentPrompts,
    recentCommands,
  };

  saveSession(dir, updatedSession);
  return updatedSession;
}

/**
 * Clears session memory for the specified directory.
 * @param {string} dir
 */
export function clearSession(dir) {
  const filePath = getSessionFilePath(dir);
  const sessionDir = path.join(dir, SESSION_DIR);

  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      // Ignore errors if unlink fails
    }
  }

  if (fs.existsSync(sessionDir)) {
    try {
      const files = fs.readdirSync(sessionDir);
      if (files.length === 0) {
        fs.rmdirSync(sessionDir);
      }
    } catch (err) {
      // Ignore errors if rmdir fails
    }
  }
}
