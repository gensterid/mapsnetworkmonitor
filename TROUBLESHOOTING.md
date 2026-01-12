# Troubleshooting Guide

## Common Issues

### 1. Database Error: `column "latency" does not exist`

This error occurs when the database schema has changed (e.g. adding the `latency` feature) but the database has not been updated.

**Solution:**

Run the following commands in your server terminal:

```bash
# 1. Pull the latest code
git pull origin main

# 2. Run the database push command (CRITICAL)
npm run db:push

# 3. Rebuild and Restart
npm run build
pm2 restart all
```

If `npm run db:push` fails with "Missing script", ensure you have pulled the latest `package.json` updates and try running it directly in the api folder:

```bash
cd apps/api
npx drizzle-kit push
```
