# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy root manifest and lockfile
COPY package.json package-lock.json ./

# Copy Web app manifest
COPY apps/web/package.json ./apps/web/

# Install dependencies (only for Web workspace)
RUN npm ci -w apps/web

# Copy Web source
COPY apps/web ./apps/web

# Build Web app
# Note: We might need to pass build-time env vars here (e.g. VITE_API_URL)
RUN npm run build -w apps/web

# Production stage
FROM nginx:alpine

# Copy Nginx config
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built files from builder
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# Expose Web port
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
