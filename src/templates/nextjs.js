// src/templates/nextjs.js
// Template definition for Next.js application

export default {
  name: 'next.js',
  aliases: ['next', 'nextjs', 'next-js'],
  description: 'Next.js application',
  summary: 'Scaffold a Next.js application',
  matchPatterns: [
    /\b(create|new|scaffold|setup|init|build|make)\b.*\bnext(\.js|js)?\b/i,
    /\bnext(\.js|js)?\b.*\b(app|project|starter|framework)\b/i,
    /^(next|nextjs|next\.js)$/i,
  ],
  getSteps: () => [
    {
      description: 'Scaffold Next.js project',
      command: 'npx create-next-app@latest . --yes',
      source: 'template',
    },
  ],
};
