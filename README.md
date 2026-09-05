# PromptOS

An AI-powered Linux/Windows command-line assistant. Describe what you want in plain English —
PromptOS turns it into a validated, step-by-step shell plan and runs it safely with your confirmation.

## How it works

1. **Plan** — your prompt + per-project session context + automatic project detection go to an LLM, which returns a
   structured JSON plan (`src/llm.js` for Gemini, `src/llm-ollama.js` for local Ollama), or instantly uses a pre-vetted scaffolding template (`src/templates/`).
2. **Validate** — every generated command is classified as `low` / `medium` / `high` risk,
   or `blocked` outright if it matches built-in or custom denylisted destructive patterns (`src/validator.js`).
3. **Confirm & execute** — low-risk steps and pre-vetted template steps run automatically; medium/high risk steps
   ask for confirmation; blocked steps never run. Output streams live with stdio non-blocking safeguards and configurable process timeouts (`src/executor.js`).
4. **Session Memory & Project Detection** — per-project memory (`.promptos/session.json`) and automatic project marker detection (`src/detect.js`) resolve vague prompts like `"give me a run command"` or `"push my changes"` against actual project scripts (`package.json`, `manage.py`, `Cargo.toml`, `.git`).
5. **Debug loop** — if a step fails, the failure + error output go back to the LLM for a
   diagnosis and a proposed fix, which you can approve and retry.

## Setup & Testing

```bash
npm install
export GEMINI_API_KEY=your-key-here   # free tier: https://aistudio.google.com/app/apikey
npm link   # makes the `promptos` command available globally (optional)

# Run test suite
npm test
```

## Local LLM Backend (Ollama) Setup

PromptOS supports running completely offline or without Gemini API keys via [Ollama](https://ollama.com).

### 1. Install & Start Ollama
Download and install Ollama from [https://ollama.com](https://ollama.com), then start the server:
```bash
ollama serve
```

### 2. Pull the Recommended Model
Pull the recommended code-generation model (`qwen2.5-coder`):
```bash
ollama pull qwen2.5-coder
```

### 3. Usage Modes
- **Automatic Fallback (Default)**: If `GEMINI_API_KEY` is not set or Gemini suffers transient rate-limits/overloads (429/503 errors), PromptOS automatically falls back to local Ollama.
- **Force Ollama Backend**: Set `LLM_BACKEND=ollama` to use local Ollama directly:
  ```bash
  export LLM_BACKEND=ollama
  promptos "create a python hello world script"
  ```
- **Custom Model or Host**:
  ```bash
  export OLLAMA_MODEL=qwen2.5-coder:7b
  export OLLAMA_HOST=http://localhost:11434
  ```

## Usage

```bash
# Natural language prompts
promptos "create a new Express API project with a /health endpoint"
promptos "install pandas and numpy in a virtualenv called venv"
promptos --yes "initialize a git repo and make an initial commit"

# Pre-vetted scaffolding templates (instant, offline)
promptos --template react --dir my-app
promptos --template express-api --dir my-server
promptos --template fastapi --dir my-fastapi-api
promptos --template next.js --dir my-next-app

# AI Website Component Generation
promptos generate "a modern portfolio with dark theme, hero section, projects, contact form" --dir my-portfolio

# Session memory reset
promptos --reset --dir my-app
```

`-y / --yes` auto-approves low/medium risk steps; high-risk steps always require explicit confirmation.

## Configuration (`.promptosrc.json`)

PromptOS supports hierarchical configuration files. Project config (`.promptosrc.json` in the working directory) overrides global config (`~/.promptos/config.json`).

### Configuration Options

- `allowlist`: Array of regular expression strings for safe commands that should be auto-classified as `low` risk (e.g. known deploy scripts). Note: hard-blocks always take precedence over allowlists.
- `denylist`: Array of regular expression strings for additional commands to hard-block outright.
- `autoApprove`: Boolean (`true`/`false`). Default auto-approve behavior (equivalent to passing `--yes`). High-risk steps still require interactive confirmation.

### Example `.promptosrc.json`

```json
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
```

## Project structure

```
src/
  index.js         CLI entry point — wires planning, validation, execution, and config together
  detect.js        Automatic project-type, scripts, package manager, and git status detector
  llm.js           Prompts Google Gemini for a structured plan + failure diagnosis
  llm-ollama.js    Local Ollama LLM backend (qwen2.5-coder)
  generate.js      AI website project scaffolder & dev server runner
  generate-llm.js  LLM React component generation engine
  validator.js     Risk classification, allowlist rules, and hard-blocked destructive patterns
  executor.js      Streams command execution and captures output with stdio non-blocking safeguards and timeouts
  session.js       Per-project session memory persistence (.promptos/session.json)
  config.js        Hierarchical config loader (.promptosrc.json and ~/.promptos/config.json)
  templates/       Pre-vetted scaffolding templates (react, express-api, fastapi, next.js)
test/
  executor.test.js    Unit tests for command execution, stdio EOF handling, and process timeouts
  detect.test.js      Unit tests for project detection (Node, Django, Flask, Python, Rust, Go, Java, Git)
  generate.test.js    Unit tests for website scaffolding, path traversal protection, and sanitization
  validator.test.js   Unit tests for risk classification, Bash, PowerShell, and config rules
  llm.test.js         Unit tests for Gemini JSON extraction, retry/backoff logic, and mocked calls
  llm-ollama.test.js  Unit tests for Ollama backend generation, ECONNREFUSED, and 404 missing model errors
  templates.test.js   Unit tests for template step generation, intent matching, and pip paths
```
