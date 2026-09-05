#!/usr/bin/env node
// src/index.js
// PromptOS CLI: natural language -> validated plan -> confirmed execution -> debug loop.

import fs from 'fs';
import path from 'path';
import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import * as llmGemini from './llm.js';
import * as llmOllama from './llm-ollama.js';
import { validatePlan } from './validator.js';
import { runCommand } from './executor.js';
import { getTemplateByName, matchTemplateFromPrompt } from './templates/index.js';
import { loadSession, updateSession, clearSession } from './session.js';
import { loadConfig } from './config.js';
import { runGenerate } from './generate.js';
import { detectProject } from './detect.js';

const RISK_COLOR = {
  low: chalk.green,
  medium: chalk.yellow,
  high: chalk.red,
  blocked: chalk.bgRed.white,
};

const program = new Command();

program
  .name('promptos')
  .description('AI-powered Linux CLI assistant: describe what you want, PromptOS plans and runs it safely.');

program
  .command('generate')
  .description('AI-generated website scaffolding: generate complete React app components, install dependencies, and launch dev server')
  .argument('<description...>', 'description of the website/app to build')
  .option('-d, --dir <path>', 'directory to generate the project in')
  .action(async (descParts, opts) => {
    const description = (descParts || []).join(' ').trim();
    if (!description) {
      console.error(chalk.red('Please provide a description for the website to generate.'));
      process.exitCode = 1;
      return;
    }
    const workDir = path.resolve(opts.dir || process.cwd());
    const success = await runGenerate(description, workDir);
    if (!success) {
      process.exitCode = 1;
    }
  });

program
  .argument('[prompt...]', 'natural language description of what you want to do')
  .option('-y, --yes', 'auto-approve low and medium risk steps (high risk always confirms)')
  .option('-d, --dir <path>', 'directory to run in / create the project in (created if missing, default: current directory)')
  .option('-t, --template <name>', 'force use of a specific template (react, express-api, fastapi, next.js)')
  .option('-r, --reset', 'clear PromptOS session memory for the target directory')
  .action(async (promptParts, opts) => {
    const userPrompt = (promptParts || []).join(' ').trim();
    const workDir = path.resolve(opts.dir || process.cwd());

    if (opts.reset) {
      clearSession(workDir);
      console.log(chalk.green(`Session memory cleared for ${workDir}`));
      return;
    }

    if (!userPrompt && !opts.template) {
      program.help();
      return;
    }

    if (!fs.existsSync(workDir)) {
      fs.mkdirSync(workDir, { recursive: true });
      console.log(chalk.gray(`Created directory: ${workDir}`));
    }

    const config = loadConfig(workDir);
    const autoApprove = Boolean(opts.yes || config.autoApprove);
    const session = loadSession(workDir);
    const detectedProject = session.projectSummary ? null : detectProject(workDir);

    let template = null;
    if (opts.template) {
      template = getTemplateByName(opts.template);
      if (!template) {
        console.error(chalk.red(`Unknown template "${opts.template}". Available templates: react, express-api, fastapi, next.js`));
        process.exitCode = 1;
        return;
      }
    } else if (userPrompt) {
      template = matchTemplateFromPrompt(userPrompt);
    }

    let plan;
    let backendName = 'Template (pre-vetted)';

    if (template) {
      console.log(chalk.green(`Using pre-vetted template: ${template.name}`));

      const existingFiles = fs.readdirSync(workDir);
      if (existingFiles.length > 0) {
        console.log(chalk.yellow(`Warning: Target directory "${workDir}" is not empty (${existingFiles.length} file(s)/folder(s) present). Scaffolding tools like create-vite or create-next-app may fail or overwrite existing files.`));
      }

      plan = {
        summary: template.summary,
        steps: template.getSteps(process.platform),
      };
    } else {
      const requestedBackend = (process.env.LLM_BACKEND || 'gemini').toLowerCase();
      const llmContext = {
        cwd: workDir,
        platform: process.platform,
        history: session.recentCommands,
        recentPrompts: session.recentPrompts,
        projectSummary: session.projectSummary,
        detectedProject,
      };

      const spinner = ora('Thinking through a plan...').start();

      if (requestedBackend === 'ollama') {
        const modelName = process.env.OLLAMA_MODEL || 'qwen2.5-coder';
        backendName = `Ollama (${modelName})`;
        try {
          plan = await llmOllama.planFromPrompt(userPrompt, llmContext);
          spinner.succeed('Plan ready.');
        } catch (err) {
          spinner.fail('Could not generate a plan via Ollama.');
          console.error(chalk.red(err.message));
          process.exitCode = 1;
          return;
        }
      } else {
        // Default Gemini backend with scoped fallback to Ollama
        if (process.env.GEMINI_API_KEY) {
          try {
            plan = await llmGemini.planFromPrompt(userPrompt, llmContext);
            backendName = 'Gemini (gemini-flash-latest)';
            spinner.succeed('Plan ready.');
          } catch (err) {
            const isTransient = /503|429|overloaded|rate limit|fetch failed|connect/i.test(err.message);
            if (isTransient) {
              spinner.text = 'Gemini API unavailable. Falling back to local Ollama backend...';
              try {
                const modelName = process.env.OLLAMA_MODEL || 'qwen2.5-coder';
                plan = await llmOllama.planFromPrompt(userPrompt, llmContext);
                backendName = `Ollama (${modelName}) [fallback]`;
                spinner.succeed('Plan ready via Ollama fallback.');
              } catch (ollamaErr) {
                spinner.fail('Could not generate a plan (Gemini failed, and Ollama fallback failed).');
                console.error(chalk.yellow(`Gemini error: ${err.message}`));
                console.error(chalk.red(`Ollama error: ${ollamaErr.message}`));
                process.exitCode = 1;
                return;
              }
            } else {
              spinner.fail('Could not generate a plan via Gemini.');
              console.error(chalk.red(err.message));
              process.exitCode = 1;
              return;
            }
          }
        } else {
          spinner.text = 'GEMINI_API_KEY not set. Using local Ollama backend...';
          try {
            const modelName = process.env.OLLAMA_MODEL || 'qwen2.5-coder';
            plan = await llmOllama.planFromPrompt(userPrompt, llmContext);
            backendName = `Ollama (${modelName}) [offline mode]`;
            spinner.succeed('Plan ready via Ollama.');
          } catch (ollamaErr) {
            spinner.fail('Could not generate a plan via Ollama.');
            console.error(chalk.yellow('GEMINI_API_KEY environment variable is not set.'));
            console.error(chalk.red(`Ollama error: ${ollamaErr.message}`));
            process.exitCode = 1;
            return;
          }
        }
      }
    }

    if (plan.needsClarification) {
      console.log(chalk.cyan('\nPromptOS needs more detail:'));
      console.log(plan.steps[0]?.description ?? plan.summary);
      return;
    }

    const { steps, hasBlocked } = validatePlan(plan.steps, config);

    console.log(chalk.bold(`\n${plan.summary}`));
    console.log(chalk.gray(`[Backend: ${backendName}]`));
    console.log(chalk.gray(`(running in ${workDir})\n`));
    steps.forEach((step, i) => {
      const color = RISK_COLOR[step.risk] || chalk.white;
      console.log(`${i + 1}. ${step.description}`);
      console.log(`   ${color(`[${step.risk}]`)} ${chalk.gray(step.command)}`);
      if (step.riskReason) console.log(`   ${chalk.dim(step.riskReason)}`);
    });

    if (hasBlocked) {
      console.log(chalk.bgRed.white('\nOne or more steps are hard-blocked for safety. Aborting.\n'));
      return;
    }

    const executedCommands = [];
    const debugBackend = backendName.includes('Ollama') ? llmOllama : llmGemini;

    try {
      for (const step of steps) {
        const isTemplateStep = step.source === 'template';
        const needsConfirm = !isTemplateStep && (step.risk === 'high' || (!autoApprove && step.risk !== 'low'));

        if (needsConfirm) {
          const { proceed } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'proceed',
              message: `Run [${step.risk}] "${step.command}" ?`,
              default: step.risk !== 'high',
            },
          ]);
          if (!proceed) {
            console.log(chalk.yellow(`Skipped: ${step.command}`));
            continue;
          }
        }

        console.log(chalk.blue(`\n$ ${step.command}`));
        executedCommands.push(step.command);
        const result = await runCommand(step.command, { cwd: workDir });

        if (!result.success) {
          console.log(chalk.red(`\nStep failed (exit code ${result.code}).`));
          const debugSpinner = ora('Diagnosing the failure...').start();
          try {
            const { diagnosis, fixedCommand } = await debugBackend.debugFailure(step.command, result.output, {
              platform: process.platform,
            });
            debugSpinner.succeed('Diagnosis ready.');
            console.log(chalk.yellow(`\nDiagnosis: ${diagnosis}`));

            if (fixedCommand) {
              const { retry } = await inquirer.prompt([
                {
                  type: 'confirm',
                  name: 'retry',
                  message: `Try fixed command: "${fixedCommand}" ?`,
                  default: true,
                },
              ]);
              if (retry) {
                console.log(chalk.blue(`\n$ ${fixedCommand}`));
                executedCommands.push(fixedCommand);
                await runCommand(fixedCommand, { cwd: workDir });
              }
            }
          } catch (err) {
            debugSpinner.fail('Could not diagnose the failure.');
          }
        }
      }
    } finally {
      updateSession(workDir, {
        prompt: userPrompt || (template ? template.description : ''),
        executedCommands,
        summary: plan.summary,
      });
    }
  });

program.parse();
