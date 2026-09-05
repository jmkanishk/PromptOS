# PromptOS

**An AI-powered command-line assistant for intelligent development automation.**

PromptOS lets you describe what you want in plain English, such as creating a project, installing dependencies, debugging an error, or generating a complete website. It converts your request into a safe, validated, step-by-step plan that runs directly in your terminal.

It bridges **natural language and the command line**, giving you the speed of AI assistance while keeping the control and transparency of a real shell.

---

## ✨ Features

* 🤖 **Natural Language Commands** - Describe development tasks in plain English.
* 🧠 **LLM-Powered Planning** - Converts prompts into structured shell commands.
* 🛡️ **Command Safety Validation** - Classifies commands as low, medium, high risk, or blocked.
* ⚡ **Instant Scaffolding** - Uses pre-vetted templates without requiring an LLM call.
* 🌐 **AI Website Generation** - Generate complete website projects from descriptions.
* 💾 **Project Memory** - Maintains lightweight context for individual projects.
* 🔍 **Project Detection** - Detects frameworks, package managers, Git repositories, and project scripts.
* 🐛 **AI Debugging** - Sends failed commands to the LLM for diagnosis and proposed fixes.
* 🖥️ **Gemini & Ollama Support** - Use a cloud LLM or a fully local backend.

---

## 🚀 Example

```bash
promptos "create a new Express API with a /health endpoint"
```

PromptOS generates a structured execution plan:

```text
Create an Express API project with a health check route
[Backend: Gemini (gemini-flash-latest)]

1. Initialize a new npm project
   [low] npm init -y

2. Install Express
   [medium] npm install express
   Modifies files, packages, or project state.

3. Create the server entry file
   [low] New-Item -ItemType File -Path index.js
```

Before executing medium or high-risk commands, PromptOS asks for confirmation:

```text
$ npm init -y
$ npm install express

Run [medium] "npm install express" ? (Y/n)
```

---

## 📚 Table of Contents

* [Why PromptOS](#why-promptos)
* [How It Works](#how-it-works)
* [Installation](#installation)
* [LLM Backend Setup](#llm-backend-setup)
* [Usage](#usage)
* [Configuration](#configuration)
* [Project Structure](#project-structure)
* [Testing](#testing)
* [Known Issues](#known-issues)
* [Roadmap](#roadmap)
* [License](#license)

---

## 💡 Why PromptOS?

Developers spend a surprising amount of time memorizing terminal syntax, scaffolding projects, installing dependencies, and searching for commands they rarely use.

Most AI coding assistants operate primarily inside an IDE and focus on code suggestions. PromptOS takes a different approach by bringing AI directly into the **command line**.

PromptOS:

1. Understands your natural-language request.
2. Creates an execution plan.
3. Validates every command.
4. Classifies command risk.
5. Requests confirmation when necessary.
6. Executes approved commands.
7. Streams command output live.
8. Uses errors to suggest fixes.

This provides the convenience of AI while keeping the user in control of terminal operations.

---

## ⚙️ How It Works

### 1. Plan

Your prompt is combined with automatically gathered context, including:

* Recent session history
* Detected project type
* Current working directory

The information is sent to an LLM, which returns a structured JSON execution plan.

For supported frameworks, PromptOS can skip the LLM entirely and use a pre-vetted scaffolding template.

### 2. Validate

Every generated or template command is classified as:

* `low`
* `medium`
* `high`
* `blocked`

Destructive commands are blocked automatically, including patterns such as:

* Whole-drive deletion
* Fork bombs
* Piping downloaded scripts directly into a shell

Blocked commands are never executed.

### 3. Confirm & Execute

* Low-risk commands can run immediately.
* Medium-risk commands require confirmation.
* High-risk commands always require explicit confirmation.
* Command output is streamed live to the terminal.

Even when auto-approve is enabled, high-risk commands still require confirmation.

### 4. Remember & Detect

PromptOS maintains lightweight per-project memory inside:

```text
.promptos/
```

This allows follow-up requests to understand previous work.

PromptOS can also detect existing projects using marker files such as:

```text
package.json
manage.py
Cargo.toml
.git
```

This helps commands such as:

```bash
promptos "give me a run command"
```

resolve to the actual project configuration instead of guessing.

### 5. Debug

When a command fails, PromptOS sends the error to the LLM for:

* Error diagnosis
* Suggested fixes
* Retry instructions

You can review and retry without starting the entire workflow again.

---

## 📦 Installation

### Requirements

* Node.js **18 or later**
* npm

### Clone the Repository

```bash
git clone <your-repo-url>
cd promptos
```

### Install Dependencies

```bash
npm install
```

### Optional: Make PromptOS Globally Available

```bash
npm link
```

After linking, you can use:

```bash
promptos
```

from any terminal directory.

---

## 🧠 LLM Backend Setup

PromptOS supports two LLM backends.

### Option A: Google Gemini

Gemini is the default backend and requires an API key.

Get a free API key from Google AI Studio.

Set the environment variable:

### Linux / macOS

```bash
export GEMINI_API_KEY=your-key-here
```

### Windows PowerShell

```powershell
$env:GEMINI_API_KEY="your-key-here"
```

PromptOS automatically retries when Gemini encounters temporary rate-limit errors and can fall back to Ollama when configured.

---

### Option B: Ollama

Ollama provides a fully local backend without requiring an API key.

Start Ollama:

```bash
ollama serve
```

Pull the recommended model:

```bash
ollama pull qwen2.5-coder
```

Set Ollama as the backend:

### Linux / macOS

```bash
export LLM_BACKEND=ollama
```

### Windows PowerShell

```powershell
$env:LLM_BACKEND="ollama"
```

You can also configure a specific model:

```bash
export OLLAMA_MODEL=qwen2.5-coder:7b
export OLLAMA_HOST=http://localhost:11434
```

---

## 🖥️ Usage

### Natural Language Commands

```bash
promptos "create a new Express API project with a /health endpoint"

promptos "install pandas and numpy in a virtualenv called venv"

promptos --yes "initialize a git repo and make an initial commit"
```

---

### ⚡ Instant Scaffolding Templates

PromptOS includes pre-vetted templates that do not require an LLM call.

```bash
promptos --template react --dir my-app

promptos --template express-api --dir my-server

promptos --template fastapi --dir my-fastapi-api

promptos --template next.js --dir my-next-app
```

Available templates:

| Template      | Description         |
| ------------- | ------------------- |
| `react`       | React application   |
| `express-api` | Express API         |
| `fastapi`     | FastAPI application |
| `next.js`     | Next.js application |

PromptOS can also automatically detect matching requests:

```bash
promptos "create a react app" --dir my-app
```

---

## 🌐 AI-Generated Websites

PromptOS can generate a website from a natural-language description.

Example:

```bash
promptos generate "a modern portfolio with dark theme, hero section, projects, contact form" --dir my-portfolio
```

The generation workflow can:

1. Scaffold the project.
2. Generate custom component code.
3. Install dependencies.
4. Start the development server.

---

## 🔧 Working With Existing Projects

PromptOS can work inside projects you have already created.

```bash
cd my-existing-app

promptos "give me a run command"

promptos "how do I push my changes"
```

PromptOS detects the project type and relevant configuration before generating its response.

---

## 💾 Session Memory

Reset the stored context for a project with:

```bash
promptos --reset --dir my-app
```

---

## 🏳️ Command-Line Flags

| Flag                    | Description                                   |
| ----------------------- | --------------------------------------------- |
| `-d, --dir <path>`      | Directory to run in or create the project in  |
| `-y, --yes`             | Auto-approve low and medium-risk steps        |
| `-t, --template <name>` | Force a specific template                     |
| `-r, --reset`           | Clear session memory for the target directory |

> **Note:** High-risk commands always require confirmation.

---

## ⚙️ Configuration

PromptOS supports project-level and global configuration.

### Project Configuration

Create:

```text
.promptosrc.json
```

inside your project directory.

### Global Configuration

Create:

```text
~/.promptos/config.json
```

Project-level configuration takes priority over global configuration.

### Example

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

### Configuration Options

| Option        | Type       | Description                                        |
| ------------- | ---------- | -------------------------------------------------- |
| `allowlist`   | `string[]` | Regex patterns for commands you trust              |
| `denylist`    | `string[]` | Additional patterns to block                       |
| `autoApprove` | `boolean`  | Automatically approve low and medium-risk commands |

Hard-blocked commands cannot be overridden through the allowlist.

---

## 📁 Project Structure

```text
src/
├── index.js
├── llm.js
├── llm-ollama.js
├── validator.js
├── executor.js
├── session.js
├── config.js
├── detect.js
├── generate.js
├── generate-llm.js
└── templates/
    ├── react
    ├── express-api
    ├── fastapi
    └── next.js

test/
├── validator.test.js
├── llm.test.js
├── llm-ollama.test.js
├── templates.test.js
├── detect.test.js
└── generate.test.js
```

### Core Components

| File              | Purpose                                       |
| ----------------- | --------------------------------------------- |
| `index.js`        | CLI entry point                               |
| `llm.js`          | Gemini planning, diagnosis, retry and backoff |
| `llm-ollama.js`   | Local Ollama backend                          |
| `validator.js`    | Command risk classification and blocking      |
| `executor.js`     | Command execution and output streaming        |
| `session.js`      | Per-project session memory                    |
| `config.js`       | Configuration loading                         |
| `detect.js`       | Project and Git detection                     |
| `generate.js`     | Website generation orchestration              |
| `generate-llm.js` | LLM-based React component generation          |
| `templates/`      | Pre-vetted project templates                  |

---

## 🧪 Testing

Run the test suite:

```bash
npm test
```

PromptOS uses Node's built-in:

```text
node:test
```

LLM requests are mocked through an injectable client, allowing the test suite to run completely offline.

Tests cover:

* Risk classification
* Bash and PowerShell commands
* Configuration allow/deny rules
* Gemini JSON extraction
* Retry and backoff behavior
* Ollama backend behavior
* Template generation
* Project detection
* File-writing protection
* Path-traversal protection

---

## ⚠️ Known Issues

### Command Timeout

`runCommand` currently does not have timeout or stdin handling.

If a command waits for interactive input, the process may remain running indefinitely.

A configurable timeout and improved stdin handling are planned.

### Gemini Rate Limits

Gemini's free tier has request limits.

Heavy usage may result in:

```text
429
503
```

PromptOS automatically retries temporary failures, but switching to Ollama can help when limits are reached.

### AI Website Generation

The quality of generated website code depends on the selected backend.

Local Ollama models may currently require more iteration than Gemini for complete and working component generation.

---

## 🗺️ Roadmap

* [ ] Add command timeout and stdin handling
* [ ] Plugin system for team-specific workflows
* [ ] Additional scaffolding templates

  * [ ] Vue
  * [ ] Django REST
  * [ ] Go/Gin
* [ ] Improve Git awareness
* [ ] Read actual `git status` and `git remote` output
* [ ] Improve Git command suggestions
* [ ] Expand AI website generation capabilities

---

## 📄 License

This project is licensed under the **MIT License**.
