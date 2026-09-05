// src/generate.js
// Scaffolding orchestrator for promptos generate.

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import chalk from 'chalk';
import { generateProject } from './generate-llm.js';
import { classifyCommand } from './validator.js';
import { runCommand } from './executor.js';

const PROTECTED_FILES = ['package.json', 'vite.config.js', 'index.html', 'eslint.config.js'];

/**
 * Renders a clean recursive directory tree view of dir.
 * @param {string} dir
 * @returns {string}
 */
export function renderDirectoryTree(dir) {
  const IGNORED = ['node_modules', '.git', '.promptos'];
  let output = '';

  function walk(currentDir, currentPrefix) {
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true })
        .filter((e) => !IGNORED.includes(e.name))
        .sort((a, b) => {
          if (a.isDirectory() && !b.isDirectory()) return -1;
          if (!a.isDirectory() && b.isDirectory()) return 1;
          return a.name.localeCompare(b.name);
        });

      entries.forEach((entry, index) => {
        const isLastEntry = index === entries.length - 1;
        const connector = isLastEntry ? '└── ' : '├── ';
        output += `${currentPrefix}${connector}${entry.name}${entry.isDirectory() ? '/' : ''}\n`;

        if (entry.isDirectory()) {
          const nextPrefix = currentPrefix + (isLastEntry ? '    ' : '│   ');
          walk(path.join(currentDir, entry.name), nextPrefix);
        }
      });
    } catch {
      // Ignore directory read errors
    }
  }

  const baseName = path.basename(dir) || dir;
  output += `${baseName}/\n`;
  walk(dir, '');
  return output;
}

/**
 * Validates whether a file path stays inside workDir and is not a protected config file.
 * @param {string} relPath
 * @param {string} workDir
 * @returns {{ valid: boolean, targetPath?: string, reason?: string }}
 */
export function validateFilePath(relPath, workDir) {
  if (!relPath || typeof relPath !== 'string') {
    return { valid: false, reason: 'Invalid or missing file path' };
  }

  const baseName = relPath.split(/[/\\]/).pop().toLowerCase();
  if (PROTECTED_FILES.includes(baseName)) {
    return { valid: false, reason: `Protected configuration file cannot be overwritten: "${relPath}"` };
  }

  const normalizedWorkDir = path.resolve(workDir);
  const targetPath = path.resolve(normalizedWorkDir, relPath);

  if (targetPath !== normalizedWorkDir && !targetPath.startsWith(normalizedWorkDir + path.sep)) {
    return { valid: false, reason: `File path escapes target directory boundary: "${relPath}"` };
  }

  return { valid: true, targetPath };
}

/**
 * Runs the website scaffolding workflow.
 * @param {string} description
 * @param {string} workDir
 * @returns {Promise<boolean>}
 */
export async function runGenerate(description, workDir) {
  const normalizedWorkDir = path.resolve(workDir || process.cwd());
  if (!fs.existsSync(normalizedWorkDir)) {
    fs.mkdirSync(normalizedWorkDir, { recursive: true });
  }

  // 1. Analyze prompt
  console.log(chalk.cyan('Analyzing prompt...'));
  let projectData;
  try {
    projectData = await generateProject(description, { cwd: normalizedWorkDir, platform: process.platform });
  } catch (err) {
    console.error(chalk.red(`\nGeneration failed: ${err.message}`));
    return false;
  }

  // 2. Scaffold base Vite React framework silently
  console.log(chalk.cyan('Generating project...'));
  const scaffoldCmd = 'npx create-vite . --template react';
  const scaffoldRisk = classifyCommand(scaffoldCmd);
  if (scaffoldRisk.level === 'blocked') {
    console.error(chalk.bgRed.white(`\nScaffolding command hard-blocked: ${scaffoldCmd}`));
    return false;
  }

  const scaffoldResult = await runCommand(scaffoldCmd, { cwd: normalizedWorkDir });
  if (!scaffoldResult.success) {
    console.error(chalk.red(`\nBase framework scaffolding failed (exit code ${scaffoldResult.code}).`));
    console.error(chalk.gray(scaffoldResult.output));
    return false;
  }

  // 3. Write generated component files
  for (const file of projectData.files || []) {
    const check = validateFilePath(file.path, normalizedWorkDir);
    if (!check.valid) {
      console.warn(chalk.yellow(`[Security Warning] ${check.reason}`));
      continue;
    }

    const dirPath = path.dirname(check.targetPath);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    fs.writeFileSync(check.targetPath, file.content, 'utf8');
  }

  // 4. Install dependencies (single unified npm install)
  console.log(chalk.cyan('Installing dependencies...'));
  let installCmd = 'npm install';
  if (Array.isArray(projectData.dependencies) && projectData.dependencies.length > 0) {
    installCmd += ' ' + projectData.dependencies.join(' ');
  }

  const installRisk = classifyCommand(installCmd);
  if (installRisk.level === 'blocked') {
    console.error(chalk.bgRed.white(`\nDependency installation hard-blocked: ${installCmd}`));
    return false;
  }

  const installResult = await runCommand(installCmd, { cwd: normalizedWorkDir });
  if (!installResult.success) {
    console.error(chalk.red(`\nDependency installation failed (exit code ${installResult.code}).`));
    console.error(chalk.gray(installResult.output));
    return false;
  }

  // 5. Success summary & directory tree view
  console.log(chalk.green('\nProject created successfully.\n'));
  const tree = renderDirectoryTree(normalizedWorkDir);
  console.log(chalk.gray(tree));

  // 6. Spawn dev server and scan output for localhost URL with 30s timeout
  console.log(chalk.cyan('Running development server...'));
  return new Promise((resolve) => {
    const child = spawn('npm', ['run', 'dev'], {
      cwd: normalizedWorkDir,
      shell: true,
      detached: false,
    });

    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        console.log(chalk.yellow('\nDevelopment server started in background. Check http://localhost:5173 or terminal logs for exact URL.'));
        child.unref();
        resolve(true);
      }
    }, 30000);

    const onData = (chunk) => {
      const text = chunk.toString();
      const match = /(Local:\s+http:\/\/localhost:\d+\/|http:\/\/localhost:\d+\/)/i.exec(text);
      if (match && !resolved) {
        resolved = true;
        clearTimeout(timeout);
        const line = text.split(/\r?\n/).find((l) => /localhost:\d+/i.test(l)) || match[0];
        console.log(chalk.bold.green(`\n  ${line.trim()}\n`));
        child.unref();
        resolve(true);
      }
    };

    child.stdout.on('data', onData);
    child.stderr.on('data', onData);

    child.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        console.error(chalk.red(`Failed to start development server: ${err.message}`));
        resolve(false);
      }
    });
  });
}
