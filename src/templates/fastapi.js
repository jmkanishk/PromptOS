// src/templates/fastapi.js
// Template definition for Python FastAPI application

export default {
  name: 'fastapi',
  aliases: ['fast-api', 'python-fastapi'],
  description: 'Python FastAPI application',
  summary: 'Scaffold a FastAPI project',
  matchPatterns: [
    /\b(create|new|scaffold|setup|init|build|make)\b.*\bfast\s*api\b/i,
    /\bfast\s*api\b.*\b(app|project|api|server|starter)\b/i,
    /^(fastapi|fast-api)$/i,
  ],
  getSteps: (platform = process.platform) => {
    const pipCmd = platform === 'win32'
      ? 'venv\\Scripts\\pip install fastapi uvicorn'
      : 'venv/bin/pip install fastapi uvicorn';

    return [
      {
        description: 'Create Python virtual environment',
        command: 'python -m venv venv',
        source: 'template',
      },
      {
        description: 'Install FastAPI and Uvicorn into virtual environment',
        command: pipCmd,
        source: 'template',
      },
    ];
  },
};
