// src/templates/express-api.js
// Template definition for Express.js API

export default {
  name: 'express-api',
  aliases: ['express', 'expressjs', 'express-server'],
  description: 'Express.js API server',
  summary: 'Scaffold an Express API project',
  matchPatterns: [
    /\b(create|new|scaffold|setup|init|build|make)\b.*\bexpress\b/i,
    /\bexpress\b.*\b(api|app|server|project|starter)\b/i,
    /^(express|express-api)$/i,
  ],
  getSteps: () => [
    {
      description: 'Initialize Node.js package',
      command: 'npm init -y',
      source: 'template',
    },
    {
      description: 'Install Express dependency',
      command: 'npm install express',
      source: 'template',
    },
  ],
};
