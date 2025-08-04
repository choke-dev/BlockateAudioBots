#!/bin/sh
set -e

# Create directories with proper permissions (as root)
mkdir -p /app/ipc
mkdir -p /app/data
chmod 777 /app/ipc
chmod 777 /app/data

# Ensure proper ownership
chown -R botuser:nodejs /app/data
chown -R botuser:nodejs /app/ipc

# Switch to non-root user for running the application
exec su-exec botuser "$@"