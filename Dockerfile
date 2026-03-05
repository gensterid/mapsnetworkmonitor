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
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache tzdata openssh-client curl

# Install PM2 globally to manage multiple processes if needed, 
# although Docker prefers one process per container.
RUN npm install -g pm2 serve

COPY --from=api-builder /app/package*.json ./
COPY --from=api-builder /app/apps/api/package*.json ./apps/api/
COPY --from=api-builder /app/apps/api/dist ./apps/api/dist
# Using npm install --omit=dev to install only production dependencies
RUN npm ci --workspace=apps/api --omit=dev

COPY --from=web-builder /app/apps/web/dist ./apps/web/dist

# Expose API PORT
EXPOSE 3001
# Expose Serve PORT (Frontend)
EXPOSE 5173

# Start script
# We will use concurrent or PM2 to serve both if you want them in the same container.
# For a cleaner setup, docker-compose should be used to separate them.
CMD ["npm", "run", "start", "--workspace=apps/api"]
