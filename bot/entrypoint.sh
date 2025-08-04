#!/bin/sh
set -e

# Create IPC directory with proper permissions
mkdir -p /app/ipc
chmod 777 /app/ipc

# Start the application
exec "$@"