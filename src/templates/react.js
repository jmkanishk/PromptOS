// src/templates/react.js
// Template definition for React (Vite)

export default {
  name: 'react',
  aliases: ['vite', 'react-vite'],
  description: 'React app powered by Vite',
  summary: 'Scaffold a React app using Vite',
  matchPatterns: [
    /\b(create|new|scaffold|setup|init|build|make)\b.*\b(react|vite)\b/i,
    /\b(react|vite)\b.*\b(app|project|sta$env:LLM_BACKEND="ollama"rter)\b/i,
    /^(react|vite)$/i,
  ],
  getSteps: () => [
    {
      description: 'Scaffold Vite React project',
      command: 'npx create-vite . --template react',
      source: 'template',
    },
    {
      description: 'Install project dependencies',
      command: 'npm install',
      source: 'template',
    },
  ],
};
