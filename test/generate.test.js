// test/generate.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs';
import { sanitizeFiles, generateProject } from '../src/generate-llm.js';
import { validateFilePath, renderDirectoryTree } from '../src/generate.js';

test('generate: sanitizeFiles protection', async (t) => {
  await t.test('filters out protected scaffolding config files', () => {
    const rawFiles = [
      { path: 'src/App.jsx', content: '// App' },
      { path: 'package.json', content: '{}' },
      { path: 'vite.config.js', content: '// config' },
      { path: 'index.html', content: '<html></html>' },
      { path: 'eslint.config.js', content: '// eslint' },
      { path: 'src/components/Hero.jsx', content: '// Hero' },
    ];

    const sanitized = sanitizeFiles(rawFiles);
    assert.equal(sanitized.length, 2);
    assert.equal(sanitized[0].path, 'src/App.jsx');
    assert.equal(sanitized[1].path, 'src/components/Hero.jsx');
  });
});

test('generate: validateFilePath security bounds', async (t) => {
  const workDir = path.resolve('test-sec-dir');

  await t.test('accepts valid nested paths inside workDir', () => {
    const res1 = validateFilePath('src/components/Hero.jsx', workDir);
    assert.equal(res1.valid, true);
    assert.equal(res1.targetPath, path.join(workDir, 'src', 'components', 'Hero.jsx'));

    const res2 = validateFilePath('src/App.css', workDir);
    assert.equal(res2.valid, true);
  });

  await t.test('rejects path traversal attempts escaping workDir', () => {
    const res1 = validateFilePath('../outside.txt', workDir);
    assert.equal(res1.valid, false);
    assert.match(res1.reason, /escapes target directory/i);

    const res2 = validateFilePath('../../etc/passwd', workDir);
    assert.equal(res2.valid, false);
  });

  await t.test('rejects protected config files regardless of path casing', () => {
    assert.equal(validateFilePath('package.json', workDir).valid, false);
    assert.equal(validateFilePath('PACKAGE.JSON', workDir).valid, false);
    assert.equal(validateFilePath('vite.config.js', workDir).valid, false);
    assert.equal(validateFilePath('index.html', workDir).valid, false);
    assert.equal(validateFilePath('eslint.config.js', workDir).valid, false);
  });
});

test('generate: renderDirectoryTree output formatting', async (t) => {
  await t.test('renders recursive directory structure while skipping node_modules and .git', () => {
    const tempDir = path.resolve('test-tree-env');
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
    fs.mkdirSync(path.join(tempDir, 'src', 'components'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'node_modules', 'react'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, '.git'), { recursive: true });

    fs.writeFileSync(path.join(tempDir, 'src', 'App.jsx'), '// App');
    fs.writeFileSync(path.join(tempDir, 'src', 'components', 'Hero.jsx'), '// Hero');

    const tree = renderDirectoryTree(tempDir);
    assert.match(tree, /src\//);
    assert.match(tree, /Hero\.jsx/);
    assert.doesNotMatch(tree, /node_modules/);
    assert.doesNotMatch(tree, /\.git/);

    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});

test('generate: generateProject component content verification', async (t) => {
  await t.test('generates portfolio components with dark theme classes and form inputs', async () => {
    const mockClient = {
      getGenerativeModel: () => ({
        generateContent: async () => ({
          response: {
            text: () =>
              JSON.stringify({
                projectName: 'dark-portfolio',
                framework: 'vite-react',
                files: [
                  {
                    path: 'src/components/Hero.jsx',
                    content: 'export function Hero() { return <section className="bg-gray-900 text-white">Hero Section</section>; }',
                  },
                  {
                    path: 'src/components/Projects.jsx',
                    content: 'export function Projects() { return <div className="dark-theme">Project Cards</div>; }',
                  },
                  {
                    path: 'src/components/Contact.jsx',
                    content: 'export function Contact() { return <form><input type="email" placeholder="Your Email" /><button type="submit">Send</button></form>; }',
                  },
                ],
                dependencies: ['lucide-react'],
              }),
          },
        }),
      }),
    };

    const project = await generateProject('a modern portfolio with dark theme, hero section, projects, contact form', { client: mockClient });
    assert.equal(project.projectName, 'dark-portfolio');
    assert.equal(project.files.length, 3);

    const hero = project.files.find((f) => f.path.endsWith('Hero.jsx'));
    const projects = project.files.find((f) => f.path.endsWith('Projects.jsx'));
    const contact = project.files.find((f) => f.path.endsWith('Contact.jsx'));

    assert.ok(hero && hero.content.includes('bg-gray-900'));
    assert.ok(projects && projects.content.includes('dark-theme'));
    assert.ok(contact && contact.content.includes('<form>') && contact.content.includes('<input'));
    assert.deepEqual(project.dependencies, ['lucide-react']);
  });
});
