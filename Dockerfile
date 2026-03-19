# Multi-stage build for Mikrotik/OLT Monitoring App

# 1. Build Layer for API
FROM node:22-alpine AS api-builder
WORKDIR /app
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
RUN npm ci --workspace=apps/api
# Copy source AFTER install to preserve Docker layer cache
COPY apps/api/ ./apps/api/
RUN npm run build --workspace=apps/api

# 2. Build Layer for Web Frontend (Using Vite)
FROM node:22-alpine AS web-builder
WORKDIR /app
COPY package*.json ./
COPY apps/web/package*.json ./apps/web/
RUN npm ci --workspace=apps/web
# Copy source AFTER install to preserve Docker layer cache
COPY apps/web/ ./apps/web/
RUN npm run build --workspace=apps/web

# 3. Production Environment (API Server + Static Hosting)
FROM node:22-alpine AS runner

# Install tini for signal handling and basic utilities
RUN apk add --no-cache tini tzdata openssh-client curl

WORKDIR /app
ENV NODE_ENV=production

# Install PM2 globally to manage multiple processes if needed
RUN npm install -g pm2 serve

COPY --from=api-builder --chown=node:node /app/package*.json ./
COPY --from=api-builder --chown=node:node /app/apps/api/package*.json ./apps/api/
COPY --from=api-builder --chown=node:node /app/apps/api/dist ./apps/api/dist
# Using npm install --omit=dev to install only production dependencies
RUN npm ci --workspace=apps/api --omit=dev

COPY --from=web-builder --chown=node:node /app/apps/web/dist ./apps/web/dist

# Ensure the app directory is owned by node
RUN chown -R node:node /app

# Switch to non-root user
USER node

# Expose API PORT
EXPOSE 3001
# Expose Serve PORT (Frontend)
EXPOSE 5173

# Use tini as entrypoint
ENTRYPOINT ["/sbin/tini", "--"]

# Start script
CMD ["npm", "run", "start", "--workspace=apps/api"]
