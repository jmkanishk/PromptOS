PromptOS

An AI-powered command-line assistant for intelligent development automation.

PromptOS lets you describe what you want in plain English — creating a project, installing dependencies, debugging an error, generating a full website — and turns it into a safe, validated, step-by-step plan that runs directly in your terminal. It bridges natural language and the command line, so you get the speed of AI assistance without giving up the control and transparency of a real shell.

$ promptos "create a new Express API with a /health endpoint"

Create an Express API project with a health check route
[Backend: Gemini (gemini-flash-latest)]
(running in C:\projects\my-api)

1. Initialize a new npm project
   [low] npm init -y
2. Install Express
   [medium] npm install express
   Modifies files, packages, or project state.
3. Create the server entry file
   [low] New-Item -ItemType File -Path index.js

$ npm init -y
$ npm install express
Run [medium] "npm install express" ? (Y/n)
Table of contents
Why PromptOS
How it works
Installation
LLM backend setup
Usage
Configuration
Project structure
Testing
Known issues
Roadmap
Why PromptOS

Developers and Linux/Windows users spend a disproportionate amount of time on things that aren't actually the interesting part of building software: memorizing terminal syntax, scaffolding project boilerplate, installing dependencies, and looking up the right flag for a command they run twice a year. Existing AI coding assistants mostly live inside an IDE and stop at code suggestions — they don't manage the terminal, the file system, or the end-to-end workflow of getting a project running.

PromptOS puts AI directly into the command line instead. It plans what needs to happen, shows you exactly what it's about to run, classifies how risky each step is, and only asks for confirmation when it matters — so you keep the speed of natural language without losing the safety and transparency of typing commands yourself.

How it works

1. Plan. Your prompt, plus automatically-gathered context (recent session history, detected project type, current directory), goes to an LLM that returns a structured JSON plan of shell steps — or, if your request matches a known framework, PromptOS skips the LLM entirely and uses an instant, pre-vetted scaffolding template.

2. Validate. Every command — whether LLM-generated or from a template — is classified as low, medium, high risk, or blocked outright if it matches a destructive pattern (a whole-drive delete, a fork bomb, piping a downloaded script straight into a shell, etc.). Blocked commands never run, no matter what generated them.

3. Confirm & execute. Low-risk steps run immediately. Medium and high-risk steps ask for your explicit approval first — high-risk steps always ask, even if you've turned on auto-approve. Output streams live, so it looks and feels like a normal terminal session.

4. Remember & detect. PromptOS keeps lightweight per-project memory (.promptos/) so follow-up requests like "now add a Dockerfile" understand what you already built. In an existing project you made yourself, it also scans for marker files (package.json, manage.py, Cargo.toml, .git, etc.) so vague requests like "give me a run command" resolve to the actual script your project defines — not a guess.

5. Debug. If a step fails, the error goes back to the LLM for a diagnosis and a proposed fix, which you can review and retry without starting over.

Installation
bash
git clone <your-repo-url>
cd promptos
npm install
npm link          # optional — makes `promptos` available as a global command

Requires Node.js 18 or later.

LLM backend setup

PromptOS needs one LLM backend. Pick whichever fits — both are free.

Option A — Google Gemini (free tier, no local setup)
Get a free key at aistudio.google.com/app/apikey
Set it:
bash
   export GEMINI_API_KEY=your-key-here

This is the default backend. Gemini's free tier has daily and per-minute rate limits — if you hit them, PromptOS automatically retries with backoff, and falls back to Ollama if you have it installed.

Option B — Ollama (fully offline, no API key)
Install Ollama and start it:
bash
   ollama serve
Pull the recommended model:
bash
   ollama pull qwen2.5-coder
Either set it as your default backend:
bash
   export LLM_BACKEND=ollama

or leave GEMINI_API_KEY unset — PromptOS will use Ollama automatically.

Custom model or host:

bash
export OLLAMA_MODEL=qwen2.5-coder:7b
export OLLAMA_HOST=http://localhost:11434
Usage
Natural language commands
bash
promptos "create a new Express API project with a /health endpoint"
promptos "install pandas and numpy in a virtualenv called venv"
promptos --yes "initialize a git repo and make an initial commit"
Instant scaffolding templates

No LLM call, no waiting — these run from a pre-vetted, fixed set of steps:

bash
promptos --template react --dir my-app
promptos --template express-api --dir my-server
promptos --template fastapi --dir my-fastapi-api
promptos --template next.js --dir my-next-app

Typing a matching phrase works too — promptos "create a react app" --dir my-app will auto-detect and use the same template.

AI-generated websites

Describe a real site and PromptOS scaffolds it, writes custom component code matching your description, installs dependencies, and starts the dev server:

bash
promptos generate "a modern portfolio with dark theme, hero section, projects, contact form" --dir my-portfolio
Working in your own existing project

Point --dir at any project you built yourself — PromptOS detects what it is and answers accordingly:

bash
cd my-existing-app
promptos "give me a run command"          # resolves to your actual package.json script
promptos "how do I push my changes"       # checks whether git is initialized first
Session memory
bash
promptos --reset --dir my-app     # clear remembered context for a project
Flags
Flag	Description
-d, --dir <path>	Directory to run in / create the project in (created if missing)
-y, --yes	Auto-approve low and medium risk steps (high risk always confirms)
-t, --template <name>	Force a specific template (react, express-api, fastapi, next.js)
-r, --reset	Clear session memory for the target directory
Configuration (.promptosrc.json)

Drop a .promptosrc.json in a project directory to customize risk behavior for that project, or ~/.promptos/config.json for a global default. Project config takes priority.

json
{
  "allowlist": [
    "^./scripts/safe-deploy\\.sh",
    "npm run custom-test"
  ],
  "denylist": [
    "rm -rf build",
    "drop database"
  ],
  "autoApprove": false
}
Option	Type	Description
allowlist	string[]	Regex patterns for commands you trust — classified as low risk. Never overrides a hard-block.
denylist	string[]	Additional regex patterns to hard-block outright, merged with PromptOS's built-in list.
autoApprove	boolean	Equivalent to always passing --yes. High-risk steps still require confirmation regardless.
Project structure
src/
  index.js          CLI entry point — wires planning, validation, execution, and config together
  llm.js            Gemini backend: structured planning, failure diagnosis, retry/backoff
  llm-ollama.js      Local Ollama backend, same interface as llm.js
  validator.js       Risk classification — hard-blocks, high/medium/low patterns, config merging
  executor.js        Streams command execution and captures output
  session.js         Per-project session memory (.promptos/session.json)
  config.js          Hierarchical config loader (.promptosrc.json, ~/.promptos/config.json)
  detect.js          Project-type/scripts/package-manager/git detection for existing projects
  generate.js         Website generation orchestrator (scaffold, write files, install, run dev server)
  generate-llm.js     LLM engine that writes actual React component code from a description
  templates/          Pre-vetted scaffolding templates: react, express-api, fastapi, next.js
test/
  validator.test.js      Risk classification — bash, PowerShell, config allow/deny merging
  llm.test.js            JSON extraction, retry/backoff logic (mocked, no network calls)
  llm-ollama.test.js      Ollama backend — payload shape, unreachable server, missing model
  templates.test.js      Template step generation and prompt intent matching
  detect.test.js          Project detection across Node/Django/Flask/Python/Rust/Go/Java/Git
  generate.test.js       File-writing, path-traversal protection, protected-file exclusion
Testing
bash
npm test

Runs on Node's built-in test runner (node:test) — no external test framework dependency. All LLM calls are mocked via an injectable client, so the suite runs fully offline.

Known issues
runCommand has no timeout or stdin handling. If a spawned command ever prompts interactively (e.g. a scaffolding tool asking "directory not empty, overwrite?"), the process will hang indefinitely rather than failing cleanly. Most likely to surface when generate or a template runs into a non-empty target directory. A fix (stdin set to ignore plus a configurable timeout) is planned.
Gemini's free tier is genuinely rate-limited. Heavy use in a short window may trigger 429/503 errors; PromptOS retries automatically, but repeated failures mean waiting a few minutes or switching to LLM_BACKEND=ollama.
AI-generated website content quality depends on the backend. Ollama's local models are currently less reliable than Gemini at producing complete, working component code for the generate command — expect more iteration when running fully offline.
Roadmap
Fix the runCommand timeout/stdin gap above
A plugin system for team-specific or org-specific workflows
Additional scaffolding templates (Vue, Django REST, Go/Gin)
Richer git awareness (reading actual git status/git remote output, not just whether .git exists) for more accurate git command suggestions

License

MIT
