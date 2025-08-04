#!/bin/sh
set -e

# Create directories with proper permissions
mkdir -p /app/ipc
mkdir -p /app/data
chmod 777 /app/ipc
chmod 777 /app/data

# Start the application
exec "$@"