# Blockate Audio Bots

This repository contains both a Discord bot and a Discord selfbot for managing audio content in Blockate-related Discord servers.

## Services

- **blockate-audio-bot**: Main Discord bot service
- **blockate-audio-selfbot**: Discord selfbot service for additional functionality

## Quick Start

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd BlockateAudioBots
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your actual values
   ```

3. **Build and run both services**
   ```bash
   docker-compose up -d
   ```

4. **View logs**
   ```bash
   # View all services logs
   docker-compose logs -f
   
   # View specific service logs
   docker-compose logs -f blockate-audio-bot
   docker-compose logs -f blockate-audio-selfbot
   ```

## Environment Variables

### Discord Bot Configuration
- `DISCORD_TOKEN`: Your Discord bot token
- `OWNERS`: Comma-separated list of Discord user IDs with owner permissions

### Database Configuration
- `DATABASE_URL`: PostgreSQL connection string
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_KEY`: Supabase anonymous key

### Notification Service
- `NTFY_AUTH`: NTFY authentication token
- `NTFY_USER`: NTFY username
- `NTFY_PASSWORD`: NTFY password

### Audio Service
- `AUDIO_FILE_PROXY_AUTH`: Audio file proxy authentication token
- `ROBLOX_ACCOUNT_COOKIE`: Roblox account cookie

### Discord Selfbot Configuration
- `ACCOUNT_TOKEN`: Discord account token for selfbot
- `ROBLOX_ACCOUNT_TOKEN`: Roblox account token

## Docker Commands

### Build services
```bash
docker-compose build
```

### Start services
```bash
docker-compose up -d
```

### Stop services
```bash
docker-compose down
```

### Restart services
```bash
docker-compose restart
```

### View service status
```bash
docker-compose ps
```

### Update services
```bash
docker-compose pull
docker-compose up -d
```

## Development

### Building individual services

**Bot only:**
```bash
docker build --target bot-production -t blockate-audio-bot .
```

**Selfbot only:**
```bash
docker build --target selfbot-production -t blockate-audio-selfbot .
```

### Local development
Each service can still be developed locally in their respective directories:

```bash
# Bot development
cd bot/
pnpm install
pnpm run dev

# Selfbot development
cd selfbot/
pnpm install
pnpm run start
```

## Architecture

The merged Docker configuration uses multi-stage builds to create optimized production images for both services:

- **Base stage**: Common Node.js setup with build dependencies
- **Builder stages**: Separate build environments for bot and selfbot
- **Production stages**: Optimized runtime images with only production dependencies

Both services communicate through:
- Shared Docker network (`blockate-network`)
- IPC sockets mounted at `/tmp`
- Environment variables for configuration

## Health Checks

- **Bot**: HTTP health check on port 51033 (`/healthcheck`)
- **Selfbot**: Node.js process health check

## Volumes

- `./bot/data:/app/data`: Bot persistent data
- `/tmp:/tmp`: IPC communication between services
- `./selfbot/config.json:/app/config.json`: Selfbot configuration

## Troubleshooting

### Check service logs
```bash
docker-compose logs -f [service-name]
```

### Restart a specific service
```bash
docker-compose restart [service-name]
```

### Rebuild and restart
```bash
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Access service shell
```bash
docker-compose exec blockate-audio-bot sh
docker-compose exec blockate-audio-selfbot sh
```

## Security Notes

- Both services run as non-root users (`botuser` and `selfbot`)
- Environment variables should be kept secure
- The selfbot token should be handled with extra care as it represents a user account

## License

See individual service directories for their respective licenses.