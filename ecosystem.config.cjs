module.exports = {
  apps: [
    {
      name: 'monitoring-api',
      cwd: 'apps/api',
      script: 'node',
      args: 'dist/index.js',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
        NODE_OPTIONS: '--max-old-space-size=1024'
      }
    },
    {
      name: 'monitoring-web',
      cwd: 'apps/web',
      script: 'npx',
      args: 'serve -s dist -l 5173',
      env_production: {
        NODE_ENV: 'production'
      }
    }
  ]
};
