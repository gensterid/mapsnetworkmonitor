module.exports = {
  apps: [
    {
      name: 'monitoring-api',
      script: 'npm',
      args: 'run start --workspace=apps/api',
      env_production: {
        NODE_ENV: 'production',
        NODE_OPTIONS: '--max-old-space-size=1024'
      }
    },
    {
      name: 'monitoring-web',
      script: 'serve',
      args: '-s apps/web/dist -l 5173',
      env_production: {
        NODE_ENV: 'production'
      }
    }
  ]
};
