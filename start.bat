@echo off
setlocal enabledelayedexpansion

REM BlockateAudioBots - Combined Startup Script (Windows)
REM This script helps manage the combined Docker setup

set "command=%1"
set "service=%2"

REM Function to check if .env file exists
:check_env_file
if not exist ".env" (
    echo [ERROR] .env file not found!
    echo [INFO] Creating .env from .env.example...
    copy ".env.example" ".env" >nul
    echo [WARNING] Please edit .env file with your actual values before running the services.
    exit /b 1
)
goto :eof

REM Function to check if Docker is running
:check_docker
docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker is not running. Please start Docker and try again.
    exit /b 1
)
goto :eof

REM Function to check if docker-compose is available
:check_docker_compose
docker-compose --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] docker-compose is not installed or not in PATH.
    exit /b 1
)
goto :eof

REM Function to start services
:start_services
echo [INFO] Starting BlockateAudioBots services...
docker-compose up -d
if errorlevel 1 (
    echo [ERROR] Failed to start services.
    exit /b 1
)
echo [SUCCESS] Services started successfully!
echo [INFO] Use 'docker-compose logs -f' to view logs
echo [INFO] Use 'docker-compose ps' to check service status
goto :eof

REM Function to stop services
:stop_services
echo [INFO] Stopping BlockateAudioBots services...
docker-compose down
if errorlevel 1 (
    echo [ERROR] Failed to stop services.
    exit /b 1
)
echo [SUCCESS] Services stopped successfully!
goto :eof

REM Function to restart services
:restart_services
echo [INFO] Restarting BlockateAudioBots services...
docker-compose restart
if errorlevel 1 (
    echo [ERROR] Failed to restart services.
    exit /b 1
)
echo [SUCCESS] Services restarted successfully!
goto :eof

REM Function to show logs
:show_logs
if "%service%"=="" (
    echo [INFO] Showing logs for all services...
    docker-compose logs -f
) else (
    echo [INFO] Showing logs for service: %service%
    docker-compose logs -f %service%
)
goto :eof

REM Function to show service status
:show_status
echo [INFO] Service status:
docker-compose ps
goto :eof

REM Function to rebuild services
:rebuild_services
echo [INFO] Rebuilding and restarting services...
docker-compose build --no-cache
if errorlevel 1 (
    echo [ERROR] Failed to rebuild services.
    exit /b 1
)
docker-compose up -d
if errorlevel 1 (
    echo [ERROR] Failed to start rebuilt services.
    exit /b 1
)
echo [SUCCESS] Services rebuilt and restarted successfully!
goto :eof

REM Function to clean up
:cleanup
echo [INFO] Cleaning up Docker resources...
docker-compose down -v --remove-orphans
docker system prune -f
echo [SUCCESS] Cleanup completed!
goto :eof

REM Function to show images
:show_images
echo [INFO] Built images:
docker images | findstr /R "blockate REPOSITORY"
goto :eof

REM Function to clean images
:clean_images
echo [INFO] Removing BlockateAudio images...
docker rmi blockate/audio-bot:latest blockate/audio-selfbot:latest >nul 2>&1
echo [SUCCESS] Images cleaned!
goto :eof

REM Function to show help
:show_help
echo BlockateAudioBots - Combined Docker Management Script (Windows)
echo.
echo Usage: %0 [COMMAND] [OPTIONS]
echo.
echo Commands:
echo   start           Start all services
echo   stop            Stop all services
echo   restart         Restart all services
echo   status          Show service status
echo   logs [service]  Show logs (optionally for specific service)
echo   rebuild         Rebuild and restart all services
echo   images          Show built images
echo   cleanup         Stop services and clean up Docker resources
echo   clean-images    Remove BlockateAudio images
echo   help            Show this help message
echo.
echo Examples:
echo   %0 start                    # Start all services
echo   %0 logs                     # Show all logs
echo   %0 logs blockate-audio-bot  # Show logs for main bot only
echo   %0 status                   # Check service status
echo   %0 images                   # Show built images
echo.
goto :eof

REM Main script logic
call :check_docker
if errorlevel 1 exit /b 1

call :check_docker_compose
if errorlevel 1 exit /b 1

if "%command%"=="start" (
    call :check_env_file
    if errorlevel 1 exit /b 1
    call :start_services
) else if "%command%"=="stop" (
    call :stop_services
) else if "%command%"=="restart" (
    call :restart_services
) else if "%command%"=="status" (
    call :show_status
) else if "%command%"=="logs" (
    call :show_logs
) else if "%command%"=="rebuild" (
    call :check_env_file
    if errorlevel 1 exit /b 1
    call :rebuild_services
) else if "%command%"=="images" (
    call :show_images
) else if "%command%"=="cleanup" (
    call :cleanup
) else if "%command%"=="clean-images" (
    call :clean_images
) else (
    call :show_help
)