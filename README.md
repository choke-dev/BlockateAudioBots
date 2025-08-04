# BlockateAudioBots - Combined Docker Setup

This repository contains both the main Discord bot and the selfbot for the BlockateAudio system, configured to run together using Docker Compose.

## Project Structure

```
BlockateAudioBots/
├── bot/                    # Main Discord bot
│   ├── Dockerfile
│   ├── docker-compose.yml # Individual bot compose file
│   └── src/               # Bot source code
├── selfbot/               # Discord selfbot
│   ├── Dockerfile
│   ├── docker-compose.yml # Individual selfbot compose file
│   └── src/               # Selfbot source code
├── shared/
│   └── ipc/              # Shared IPC directory for bot communication
├── docker-compose.yml    # Combined compose file (USE THIS)
├── .env.example          # Combined environment variables template
└── README.md            # This file
```

## Services

The combined setup includes three main services:

1. **blockate-audio-bot** - Main Discord bot service (image: `blockate/audio-bot:latest`)
2. **blockate-audio-selfbot** - Discord selfbot service (image: `blockate/audio-selfbot:latest`)
3. **ntfy** - Notification service (image: `binwiederhier/ntfy:latest`)

## Quick Start

### 1. Environment Setup

Copy the environment template and configure your values:

```bash
cp .env.example .env
```

Edit `.env` and fill in all the required values:

```bash
# Main bot configuration
DISCORD_TOKEN=your_discord_bot_token_here
OWNERS=your_discord_user_id_here
DATABASE_URL=your_database_url_here
SUPABASE_URL=your_supabase_url_here
SUPABASE_KEY=your_supabase_key_here

# Selfbot configuration
SELFBOT_ACCOUNT_TOKEN=your_discord_account_token_here
SELFBOT_ROBLOX_ACCOUNT_TOKEN=your_roblox_account_token_here

# Notification service
NTFY_USER=your_ntfy_username
NTFY_PASSWORD=your_ntfy_password

# Audio service
AUDIO_FILE_PROXY_AUTH=your_audio_proxy_auth_token
ROBLOX_ACCOUNT_COOKIE=your_roblox_account_cookie
```

### 2. Run the Combined Setup

Start all services together:

```bash
docker-compose up -d
```

This will start:
- Main Discord bot
- Discord selfbot
- ntfy notification service

### 3. Check Service Status

View running containers:

```bash
docker-compose ps
```

View logs:

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f blockate-audio-bot
docker-compose logs -f blockate-audio-selfbot
docker-compose logs -f ntfy
```

### 4. Stop Services

Stop all services:

```bash
docker-compose down
```

## Individual Service Management

You can also run services individually if needed:

### Main Bot Only
```bash
cd bot
docker-compose up -d
```

### Selfbot Only
```bash
cd selfbot
docker-compose up -d
```

## Service Communication

The bot and selfbot communicate through IPC (Inter-Process Communication) using the shared volume mounted at `/app/ipc` in both containers. This allows them to coordinate actions and share data.

## Networking

All services run on a custom Docker network (`blockate-network`) which allows them to communicate with each other using service names as hostnames.

## Volumes and Data Persistence

- **Bot data**: `./bot/data` → `/app/data` (bot persistent data)
- **ntfy data**: `./bot/ntfy` → `/var/lib/ntfy` (notification service data)
- **IPC communication**: `./shared/ipc` → `/app/ipc` (shared between bot and selfbot)
- **Selfbot config**: `./selfbot/config.json` → `/app/config.json` (selfbot configuration)

## Ports

- **ntfy service**: `8080:80` - Web interface for notifications

## Environment Variables

### Main Bot Variables
- `DISCORD_TOKEN` - Discord bot token
- `OWNERS` - Discord user ID of bot owners
- `DATABASE_URL` - PostgreSQL database connection string
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_KEY` - Supabase service role key
- `NTFY_USER` - ntfy username
- `NTFY_PASSWORD` - ntfy password
- `AUDIO_FILE_PROXY_AUTH` - Audio proxy authentication token
- `ROBLOX_ACCOUNT_COOKIE` - Roblox account cookie

### Selfbot Variables
- `SELFBOT_ACCOUNT_TOKEN` - Discord account token for selfbot
- `SELFBOT_ROBLOX_ACCOUNT_TOKEN` - Roblox account token for selfbot

## Troubleshooting

### Check if services are running
```bash
docker-compose ps
```

### View service logs
```bash
docker-compose logs [service-name]
```

### Restart a specific service
```bash
docker-compose restart [service-name]
```

### Rebuild services after code changes
```bash
docker-compose build
docker-compose up -d
```

### View built images
```bash
docker images | grep blockate
```

### Clean up everything
```bash
docker-compose down -v --remove-orphans
docker system prune -f
```

### Remove specific images
```bash
docker rmi blockate/audio-bot:latest
docker rmi blockate/audio-selfbot:latest
```

## Development

For development, you can run services individually or use the combined setup. The individual docker-compose files in each project directory are still functional for isolated testing.

## Security Notes

- Never commit your `.env` file to version control
- Keep your Discord tokens and API keys secure
- The selfbot functionality should be used responsibly and in compliance with Discord's Terms of Service
- Consider using Docker secrets for production deployments

## Support

If you encounter issues:

1. Check the logs: `docker-compose logs -f`
2. Verify your environment variables in `.env`
3. Ensure all required tokens and credentials are valid
4. Check that ports are not already in use on your system