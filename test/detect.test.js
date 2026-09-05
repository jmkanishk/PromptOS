// test/detect.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs';
import { detectProject } from '../src/detect.js';
import { formatDetectedProject } from '../src/llm.js';

test('detect: Node.js project detection and lockfiles', async (t) => {
  const tempDir = path.resolve('test-detect-node');
  if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
  fs.mkdirSync(tempDir, { recursive: true });

  await t.test('detects Node.js project with package.json scripts and npm default', () => {
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'test-app',
        scripts: { dev: 'vite', build: 'vite build', start: 'node server.js' },
      })
    );

    const res = detectProject(tempDir);
    assert.equal(res.type, 'node');
    assert.equal(res.packageManager, 'npm');
    assert.deepEqual(res.scripts, { dev: 'vite', build: 'vite build', start: 'node server.js' });
  });

  await t.test('detects yarn package manager when yarn.lock is present', () => {
    fs.writeFileSync(path.join(tempDir, 'yarn.lock'), '');
    const res = detectProject(tempDir);
    assert.equal(res.packageManager, 'yarn');
    fs.unlinkSync(path.join(tempDir, 'yarn.lock'));
  });

  await t.test('detects pnpm package manager when pnpm-lock.yaml is present', () => {
    fs.writeFileSync(path.join(tempDir, 'pnpm-lock.yaml'), '');
    const res = detectProject(tempDir);
    assert.equal(res.packageManager, 'pnpm');
    fs.unlinkSync(path.join(tempDir, 'pnpm-lock.yaml'));
  });

  await t.test('detects bun package manager when bun.lockb is present', () => {
    fs.writeFileSync(path.join(tempDir, 'bun.lockb'), '');
    const res = detectProject(tempDir);
    assert.equal(res.packageManager, 'bun');
    fs.unlinkSync(path.join(tempDir, 'bun.lockb'));
  });

  await t.test('gracefully handles malformed package.json without crashing', () => {
    fs.writeFileSync(path.join(tempDir, 'package.json'), '{ malformed json syntax ');
    const res = detectProject(tempDir);
    assert.equal(res.type, 'node');
    assert.deepEqual(res.scripts, {});
    assert.equal(res.packageManager, 'npm');
  });

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('detect: Python, Django, and Flask project detection', async (t) => {
  const tempDir = path.resolve('test-detect-py');
  if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
  fs.mkdirSync(tempDir, { recursive: true });

  await t.test('detects Django project with manage.py', () => {
    fs.writeFileSync(path.join(tempDir, 'manage.py'), '# django');
    fs.writeFileSync(path.join(tempDir, 'requirements.txt'), 'django>=4.0');

    const res = detectProject(tempDir);
    assert.equal(res.type, 'django');
  });

  await t.test('detects Flask project with app.py', () => {
    fs.unlinkSync(path.join(tempDir, 'manage.py'));
    fs.writeFileSync(path.join(tempDir, 'app.py'), '# flask');

    const res = detectProject(tempDir);
    assert.equal(res.type, 'flask');
  });

  await t.test('detects generic Python project with requirements.txt alone', () => {
    fs.unlinkSync(path.join(tempDir, 'app.py'));
    const res = detectProject(tempDir);
    assert.equal(res.type, 'python');
  });

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('detect: Rust, Go, Java, Git, and Unknown detection', async (t) => {
  const tempDir = path.resolve('test-detect-misc');
  if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
  fs.mkdirSync(tempDir, { recursive: true });

  await t.test('detects Rust project with Cargo.toml', () => {
    fs.writeFileSync(path.join(tempDir, 'Cargo.toml'), '[package]');
    assert.equal(detectProject(tempDir).type, 'rust');
    fs.unlinkSync(path.join(tempDir, 'Cargo.toml'));
  });

  await t.test('detects Go project with go.mod', () => {
    fs.writeFileSync(path.join(tempDir, 'go.mod'), 'module test');
    assert.equal(detectProject(tempDir).type, 'go');
    fs.unlinkSync(path.join(tempDir, 'go.mod'));
  });

  await t.test('detects Java Maven and Gradle projects', () => {
    fs.writeFileSync(path.join(tempDir, 'pom.xml'), '<project></project>');
    assert.equal(detectProject(tempDir).type, 'java-maven');
    fs.unlinkSync(path.join(tempDir, 'pom.xml'));

    fs.writeFileSync(path.join(tempDir, 'build.gradle'), '// gradle');
    assert.equal(detectProject(tempDir).type, 'java-gradle');
    fs.unlinkSync(path.join(tempDir, 'build.gradle'));
  });

  await t.test('detects Git initialization status via .git directory', () => {
    assert.equal(detectProject(tempDir).gitInitialized, false);
    fs.mkdirSync(path.join(tempDir, '.git'));
    assert.equal(detectProject(tempDir).gitInitialized, true);
  });

  await t.test('returns unknown for empty directory', () => {
    fs.rmSync(path.join(tempDir, '.git'), { recursive: true, force: true });
    const res = detectProject(tempDir);
    assert.equal(res.type, 'unknown');
    assert.equal(res.gitInitialized, false);
  });

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('detect: formatDetectedProject helper in llm.js', () => {
  const nodeContext = {
    type: 'node',
    scripts: { dev: 'vite', build: 'vite build' },
    packageManager: 'pnpm',
    gitInitialized: true,
  };

  const formatted = formatDetectedProject(nodeContext);
  assert.match(formatted, /Project type: node/);
  assert.match(formatted, /Available package\.json scripts: dev, build/);
  assert.match(formatted, /Package manager: pnpm/);
  assert.match(formatted, /Git repository initialized: yes/);

  const unknownNoGit = { type: 'unknown', gitInitialized: false };
  assert.match(formatDetectedProject(unknownNoGit), /Git repository status: \.git repository NOT initialized/);
});
