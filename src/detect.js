// src/detect.js
// Inspects a project directory for marker files to detect framework, scripts, package manager, and git status.

import fs from 'fs';
import path from 'path';

/**
 * Scans top-level files of workDir and returns a project summary object.
 * @param {string} workDir
 * @returns {{ type: string, scripts: object, packageManager: 'npm'|'yarn'|'pnpm'|'bun', gitInitialized: boolean }}
 */
export function detectProject(workDir) {
  const dir = path.resolve(workDir || process.cwd());
  const info = {
    type: 'unknown',
    scripts: {},
    packageManager: 'npm',
    gitInitialized: false,
  };

  try {
    if (!fs.existsSync(dir)) return info;
  } catch {
    return info;
  }

  info.gitInitialized = fs.existsSync(path.join(dir, '.git'));

  // 1. Node.js detection
  const pkgPath = path.join(dir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    info.type = 'node';
    try {
      const content = fs.readFileSync(pkgPath, 'utf8');
      const pkg = JSON.parse(content);
      if (pkg && typeof pkg === 'object' && pkg.scripts && typeof pkg.scripts === 'object') {
        info.scripts = pkg.scripts;
      }
    } catch {
      // Malformed package.json: keep type as 'node', empty scripts, default npm
    }

    if (fs.existsSync(path.join(dir, 'pnpm-lock.yaml'))) {
      info.packageManager = 'pnpm';
    } else if (fs.existsSync(path.join(dir, 'yarn.lock'))) {
      info.packageManager = 'yarn';
    } else if (fs.existsSync(path.join(dir, 'bun.lockb')) || fs.existsSync(path.join(dir, 'bun.lock'))) {
      info.packageManager = 'bun';
    } else {
      info.packageManager = 'npm';
    }

    return info;
  }

  // 2. Python / Django / Flask detection
  const hasReqs =
    fs.existsSync(path.join(dir, 'requirements.txt')) ||
    fs.existsSync(path.join(dir, 'pyproject.toml')) ||
    fs.existsSync(path.join(dir, 'Pipfile'));
  const hasManagePy = fs.existsSync(path.join(dir, 'manage.py'));
  const hasAppPy = fs.existsSync(path.join(dir, 'app.py')) || fs.existsSync(path.join(dir, 'main.py'));

  if (hasManagePy || (hasReqs && hasManagePy)) {
    info.type = 'django';
    return info;
  }
  if (hasAppPy || (hasReqs && hasAppPy)) {
    info.type = 'flask';
    return info;
  }
  if (hasReqs) {
    info.type = 'python';
    return info;
  }

  // 3. Rust detection
  if (fs.existsSync(path.join(dir, 'Cargo.toml'))) {
    info.type = 'rust';
    return info;
  }

  // 4. Go detection
  if (fs.existsSync(path.join(dir, 'go.mod'))) {
    info.type = 'go';
    return info;
  }

  // 5. Java Maven / Gradle detection
  if (fs.existsSync(path.join(dir, 'pom.xml'))) {
    info.type = 'java-maven';
    return info;
  }
  if (fs.existsSync(path.join(dir, 'build.gradle')) || fs.existsSync(path.join(dir, 'build.gradle.kts'))) {
    info.type = 'java-gradle';
    return info;
  }

  return info;
}
