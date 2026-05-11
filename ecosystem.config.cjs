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
        // Headroom for 50-150 router fleets. Bump to 4096 if you exceed ~200
        // routers or see frequent V8 GC pauses in logs.
        NODE_OPTIONS: '--max-old-space-size=2048',
        // Worker concurrency knobs (Fase A.4). Increase if MikroTik / DB can
        // keep up; decrease if you see connection saturation.
        ROUTER_SYNC_CONCURRENCY: '20',
        OLT_SYNC_CONCURRENCY: '10'
      },
      max_memory_restart: '2500M'
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
