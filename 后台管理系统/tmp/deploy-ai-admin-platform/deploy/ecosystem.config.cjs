module.exports = {
  apps: [
    {
      name: 'ai-admin-api',
      cwd: './api-server',
      script: 'dist/app.js',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
        ENV_FILE: '../.env',
      },
    },
  ],
};
