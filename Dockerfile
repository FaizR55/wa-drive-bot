# Multi-stage build for optimized image size
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Final stage
FROM node:20-alpine

WORKDIR /app

# Install minimal runtime dependencies (Chromium runs as a separate service)
RUN apk add --no-cache \
  dumb-init \
  ca-certificates

ENV PUPPETEER_SKIP_DOWNLOAD=true

# Copy node_modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application code
COPY src/ ./src/
COPY package*.json ./

# Create necessary directories for volumes
RUN mkdir -p /app/uploads /app/tokens /app/.wwebjs_cache

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Use dumb-init to handle signals
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Start application
CMD ["node", "src/app.js"]
