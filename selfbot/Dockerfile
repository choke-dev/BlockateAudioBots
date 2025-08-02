# Use Node.js 20 LTS as base image
FROM node:20-alpine AS builder

# Install build dependencies and pnpm
RUN apk add --no-cache \
    build-base \
    python3 \
    make \
    g++ \
    && npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Install all dependencies (including dev dependencies for building)
RUN pnpm install --frozen-lockfile

# Copy source code and configuration files
COPY src/ ./src/
COPY tsconfig.json ./
COPY .eslintrc.cjs ./
COPY config.json ./

# Build the TypeScript project
RUN pnpm run build

# Production stage
FROM node:20-alpine AS production

# Install runtime dependencies and pnpm
RUN apk add --no-cache \
    dumb-init \
    && npm install -g pnpm

# Create app directory
WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S selfbot -u 1001

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Install only production dependencies
RUN pnpm install --frozen-lockfile --prod

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/config.json ./

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

# Start the application with dumb-init for proper signal handling
CMD ["dumb-init", "pnpm", "start"]