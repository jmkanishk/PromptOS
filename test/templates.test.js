// test/templates.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { templates, getTemplateByName, matchTemplateFromPrompt } from '../src/templates/index.js';

test('templates: template registry and lookup', async (t) => {
  await t.test('all expected templates are registered', () => {
    const names = templates.map((t) => t.name);
    assert.deepEqual(names, ['react', 'express-api', 'fastapi', 'next.js']);
  });

  await t.test('getTemplateByName resolves templates by name or alias', () => {
    assert.equal(getTemplateByName('react')?.name, 'react');
    assert.equal(getTemplateByName('vite')?.name, 'react');
    assert.equal(getTemplateByName('express')?.name, 'express-api');
    assert.equal(getTemplateByName('fastapi')?.name, 'fastapi');
    assert.equal(getTemplateByName('nextjs')?.name, 'next.js');
    assert.equal(getTemplateByName('unknown'), null);
  });

  await t.test('matchTemplateFromPrompt detects framework intent from prompt', () => {
    assert.equal(matchTemplateFromPrompt('create a react app')?.name, 'react');
    assert.equal(matchTemplateFromPrompt('new express api')?.name, 'express-api');
    assert.equal(matchTemplateFromPrompt('scaffold fastapi')?.name, 'fastapi');
    assert.equal(matchTemplateFromPrompt('create a next.js app')?.name, 'next.js');
    assert.equal(matchTemplateFromPrompt('random request'), null);
  });
});

test('templates: valid step generation and platform assertions', async (t) => {
  for (const tmpl of templates) {
    await t.test(`template "${tmpl.name}" generates non-empty steps with source metadata`, () => {
      const winSteps = tmpl.getSteps('win32');
      const linuxSteps = tmpl.getSteps('linux');

      assert.ok(winSteps.length > 0);
      assert.ok(linuxSteps.length > 0);

      for (const step of [...winSteps, ...linuxSteps]) {
        assert.ok(step.description && typeof step.description === 'string');
        assert.ok(step.command && typeof step.command === 'string');
        assert.equal(step.source, 'template');
      }
    });
  }

  await t.test('fastapi template generates exact platform-specific pip install commands', () => {
    const fastapi = getTemplateByName('fastapi');
    assert.ok(fastapi);

    const winSteps = fastapi.getSteps('win32');
    const linuxSteps = fastapi.getSteps('linux');
    const darwinSteps = fastapi.getSteps('darwin');

    assert.equal(winSteps.length, 2);
    assert.equal(winSteps[0].command, 'python -m venv venv');
    assert.equal(winSteps[1].command, 'venv\\Scripts\\pip install fastapi uvicorn');

    assert.equal(linuxSteps.length, 2);
    assert.equal(linuxSteps[0].command, 'python -m venv venv');
    assert.equal(linuxSteps[1].command, 'venv/bin/pip install fastapi uvicorn');

    assert.equal(darwinSteps.length, 2);
    assert.equal(darwinSteps[1].command, 'venv/bin/pip install fastapi uvicorn');
  });
});
