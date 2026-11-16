// PURRE PETS — PM2 (produkcja, Oracle Ubuntu 24.04 ARM64).
// Frontend: TanStack Start SSR na Nitro → node .output/server/index.mjs (127.0.0.1:3000)
// Backend:  Express + Prisma + Socket.IO → backend/src/server.js (127.0.0.1:4000)
//
// SEKRETY: ten plik NIE zawiera sekretów. Backend czyta backend/.env sam (dotenv/config
// przy starcie) — trzymaj tam DATABASE_URL, JWT_SECRET, SMTP_*, STRIPE_*, OLLAMA_*.
// Restart z env: pm2 startOrReload ecosystem.config.cjs --update-env
const path = require('node:path');

const APP_DIR = process.env.PURRE_APP_DIR || '/home/ubuntu/PurrePets';
const LOG_DIR = path.join(APP_DIR, 'logs');

module.exports = {
  apps: [
    {
      name: 'purrepets-frontend',
      script: '.output/server/index.mjs',
      cwd: APP_DIR,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 20,
      min_uptime: '10s',
      restart_delay: 2000,
      kill_timeout: 8000,
      max_memory_restart: '600M',
      time: true,
      out_file: path.join(LOG_DIR, 'frontend-out.log'),
      error_file: path.join(LOG_DIR, 'frontend-error.log'),
      merge_logs: true,
      env: { NODE_ENV: 'production', PORT: 3000, HOST: '127.0.0.1' },
    },
    {
      name: 'purrepets-backend',
      script: './src/server.js',
      cwd: path.join(APP_DIR, 'backend'),
      instances: 1, // Socket.IO wymaga 1 procesu (bez Redisa)
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 20,
      min_uptime: '10s',
      restart_delay: 2000,
      kill_timeout: 8000,
      max_memory_restart: '600M',
      time: true,
      out_file: path.join(LOG_DIR, 'backend-out.log'),
      error_file: path.join(LOG_DIR, 'backend-error.log'),
      merge_logs: true,
      env: { NODE_ENV: 'production', PORT: 4000, HOST: '127.0.0.1', FRONTEND_PORT: 3000 },
    },
  ],
};
