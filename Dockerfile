# Use Node.js 20 LTS as base image
FROM node:20-alpine AS base

# Install build dependencies and pnpm
RUN apk add --no-cache build-base python3 make g++ linux-headers inotify-tools
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Bot builder stage
FROM base AS bot-builder

# Copy bot package files first for better caching
COPY bot/package.json bot/pnpm-lock.yaml ./

# Install all dependencies with cache mount for better caching
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    --mount=type=cache,target=/root/.cache/pnpm \
    pnpm install --frozen-lockfile

# Copy bot source code and configuration files
COPY bot/src/ ./src/
COPY bot/tsconfig.json ./
COPY bot/.sapphirerc.json ./

# Build the bot TypeScript project
RUN pnpm run build

# Selfbot builder stage
FROM base AS selfbot-builder

# Copy selfbot package files first for better caching
COPY selfbot/package.json selfbot/pnpm-lock.yaml ./

# Install all dependencies with cache mount for better caching
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    --mount=type=cache,target=/root/.cache/pnpm \
    pnpm install --frozen-lockfile

# Copy selfbot source code and configuration files
COPY selfbot/src/ ./src/
COPY selfbot/tsconfig.json ./
COPY selfbot/.eslintrc.cjs ./
COPY selfbot/config.json ./

# Build the selfbot TypeScript project (fix the npm-run-all command)
RUN pnpm clean && pnpm build:compile

# Bot production stage
FROM node:20-alpine AS bot-production

# Install runtime dependencies and pnpm
RUN apk add --no-cache \
    dumb-init \
    curl \
    && npm install -g pnpm

# Create app directory
WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S botuser -u 1001

# Copy bot package files
COPY bot/package.json bot/pnpm-lock.yaml ./

# Install only production dependencies with cache mount
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    --mount=type=cache,target=/root/.cache/pnpm \
    pnpm install --frozen-lockfile --prod

# Copy built bot application from builder stage
COPY --from=bot-builder /app/dist ./dist

# Change ownership to non-root user
RUN chown -R botuser:nodejs /app
USER botuser

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

# Start the bot application with dumb-init for proper signal handling
CMD ["dumb-init", "pnpm", "start"]

# Selfbot production stage
FROM node:20-alpine AS selfbot-production

# Install runtime dependencies and pnpm
RUN apk add --no-cache \
    dumb-init \
    && npm install -g pnpm

# Create app directory
WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S selfbot -u 1001

# Copy selfbot package files
COPY selfbot/package.json selfbot/pnpm-lock.yaml ./

# Install only production dependencies with cache mount
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    --mount=type=cache,target=/root/.cache/pnpm \
    pnpm install --frozen-lockfile --prod

# Copy built selfbot application from builder stage
COPY --from=selfbot-builder /app/dist ./dist
COPY --from=selfbot-builder /app/config.json ./

# Change ownership to non-root user
RUN chown -R selfbot:nodejs /app
USER selfbot

# Environment variables with defaults
ENV NODE_ENV=production
ENV ACCOUNT_TOKEN=""
ENV ROBLOX_ACCOUNT_TOKEN=""

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "console.log('Selfbot is running')" || exit 1

# Start the selfbot application with dumb-init for proper signal handling
CMD ["dumb-init", "node", "--no-warnings", "dist/index.js"]