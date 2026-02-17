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

WORKDIR /app

# Install production dependencies only
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/

RUN npm ci -w apps/api --omit=dev

# Copy built files from builder
COPY --from=builder /app/apps/api/dist ./apps/api/dist

# Expose API port
EXPOSE 3000

# Start API
CMD ["npm", "start", "-w", "apps/api"]
