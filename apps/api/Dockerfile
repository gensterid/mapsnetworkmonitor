# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy root manifest and lockfile
COPY package.json package-lock.json ./

# Copy API app manifest
COPY apps/api/package.json ./apps/api/

# Install dependencies (only for API workspace)
RUN npm ci -w apps/api

# Copy API source
COPY apps/api ./apps/api

# Build API
RUN npm run build -w apps/api

# Production stage
FROM node:22-alpine

# Install tini for signal handling and basic utilities
RUN apk add --no-cache tini curl

WORKDIR /app
ENV NODE_ENV=production

# Install production dependencies only
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/

RUN npm ci -w apps/api --omit=dev

# Copy built files from builder with correct ownership
COPY --from=builder --chown=node:node /app/apps/api/dist ./apps/api/dist

# Ensure the app directory is owned by node
RUN chown -R node:node /app

# Switch to non-root user
USER node

# Expose API port
EXPOSE 3001

# Use tini as entrypoint
ENTRYPOINT ["/sbin/tini", "--"]

# Start API
CMD ["npm", "start", "-w", "apps/api"]
