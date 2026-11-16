// PM2 process file — run from the backend directory: pm2 start ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: "purrepets-backend",
      script: "src/server.js",
      cwd: __dirname,
      instances: 1, // Socket.IO rooms require a single process (or a Redis adapter when scaling)
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
      },
      max_memory_restart: "400M",
      out_file: "logs/out.log",
      error_file: "logs/error.log",
      merge_logs: true,
      time: true,
    },
  ],
};
