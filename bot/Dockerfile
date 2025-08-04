# Use Node.js 20 LTS as base image
FROM node:20-alpine AS builder

# Install build dependencies and pnpm
RUN apk add --no-cache python3 make g++ linux-headers build-base
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package.json pnpm-lock.yaml ./

# Install all dependencies (including dev dependencies for building)
RUN pnpm install --frozen-lockfile

# Copy source code and configuration files
COPY src/ ./src/
COPY tsconfig.json ./
COPY .sapphirerc.json ./

# Build the TypeScript project
RUN pnpm run build
RUN if [ ! -d dist ]; then echo "❌  Build failed: dist/ not found" >&2; exit 1; fi

# Production stage
FROM node:20-alpine AS production

# Install runtime dependencies and pnpm
RUN apk add --no-cache \
    dumb-init \
    && npm install -g pnpm
RUN apk -U add yt-dlp

# Create app directory
WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S botuser -u 1001

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install only production dependencies
RUN pnpm install --frozen-lockfile --prod

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Create IPC directory with proper permissions
RUN mkdir -p /app/ipc && chmod 777 /app/ipc

# Change ownership to non-root user
RUN chown -R botuser:nodejs /app
USER botuser

# Set entrypoint
ENTRYPOINT ["/entrypoint.sh"]

# Environment variables with defaults
ENV NODE_ENV=production
ENV DISCORD_TOKEN=
ENV OWNERS=
ENV DATABASE_URL=
ENV SUPABASE_URL=
ENV SUPABASE_KEY=
ENV NTFY_AUTH=
ENV NTFY_USER=
ENV NTFY_PASSWORD=
ENV AUDIO_FILE_PROXY_AUTH=
ENV ROBLOX_ACCOUNT_COOKIE=

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -s -f localhost:51033/healthcheck || exit 1

# Start the application with dumb-init for proper signal handling
CMD ["dumb-init", "pnpm", "start"]