module.exports = {
  apps: [
    {
      name: 'monitoring-api',
      script: 'node',
      args: 'apps/api/dist/index.js',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
        NODE_OPTIONS: '--max-old-space-size=1024'
      }
    },
    {
      name: 'monitoring-web',
      script: 'npx',
      args: 'serve -s apps/web/dist -l 5173',
      env_production: {
        NODE_ENV: 'production'
      }
    }
  ]
};
