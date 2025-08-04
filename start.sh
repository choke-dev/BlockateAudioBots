#!/bin/bash

# BlockateAudioBots - Combined Startup Script
# This script helps manage the combined Docker setup

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if .env file exists
check_env_file() {
    if [ ! -f ".env" ]; then
        print_error ".env file not found!"
        print_status "Creating .env from .env.example..."
        cp .env.example .env
        print_warning "Please edit .env file with your actual values before running the services."
        exit 1
    fi
}

# Function to check if Docker is running
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        print_error "Docker is not running. Please start Docker and try again."
        exit 1
    fi
}

# Function to check if docker-compose is available
check_docker_compose() {
    if ! command -v docker-compose > /dev/null 2>&1; then
        print_error "docker-compose is not installed or not in PATH."
        exit 1
    fi
}

# Function to start services
start_services() {
    print_status "Starting BlockateAudioBots services..."
    docker-compose up -d
    print_success "Services started successfully!"
    print_status "Use 'docker-compose logs -f' to view logs"
    print_status "Use 'docker-compose ps' to check service status"
}

# Function to stop services
stop_services() {
    print_status "Stopping BlockateAudioBots services..."
    docker-compose down
    print_success "Services stopped successfully!"
}

# Function to restart services
restart_services() {
    print_status "Restarting BlockateAudioBots services..."
    docker-compose restart
    print_success "Services restarted successfully!"
}

# Function to show logs
show_logs() {
    if [ -n "$1" ]; then
        print_status "Showing logs for service: $1"
        docker-compose logs -f "$1"
    else
        print_status "Showing logs for all services..."
        docker-compose logs -f
    fi
}

# Function to show service status
show_status() {
    print_status "Service status:"
    docker-compose ps
}

# Function to rebuild services
rebuild_services() {
    print_status "Rebuilding and restarting services..."
    docker-compose build --no-cache
    docker-compose up -d
    print_success "Services rebuilt and restarted successfully!"
}

# Function to clean up
cleanup() {
    print_status "Cleaning up Docker resources..."
    docker-compose down -v --remove-orphans
    docker system prune -f
    print_success "Cleanup completed!"
}

# Function to show images
show_images() {
    print_status "Built images:"
    docker images | grep -E "(blockate|REPOSITORY)"
}

# Function to clean images
clean_images() {
    print_status "Removing BlockateAudio images..."
    docker rmi blockate/audio-bot:latest blockate/audio-selfbot:latest 2>/dev/null || true
    print_success "Images cleaned!"
}

# Function to show help
show_help() {
    echo "BlockateAudioBots - Combined Docker Management Script"
    echo ""
    echo "Usage: $0 [COMMAND] [OPTIONS]"
    echo ""
    echo "Commands:"
    echo "  start           Start all services"
    echo "  stop            Stop all services"
    echo "  restart         Restart all services"
    echo "  status          Show service status"
    echo "  logs [service]  Show logs (optionally for specific service)"
    echo "  rebuild         Rebuild and restart all services"
    echo "  images          Show built images"
    echo "  cleanup         Stop services and clean up Docker resources"
    echo "  clean-images    Remove BlockateAudio images"
    echo "  help            Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 start                    # Start all services"
    echo "  $0 logs                     # Show all logs"
    echo "  $0 logs blockate-audio-bot  # Show logs for main bot only"
    echo "  $0 status                   # Check service status"
    echo "  $0 images                   # Show built images"
    echo ""
}

# Main script logic
main() {
    # Check prerequisites
    check_docker
    check_docker_compose
    
    # Handle commands
    case "${1:-help}" in
        "start")
            check_env_file
            start_services
            ;;
        "stop")
            stop_services
            ;;
        "restart")
            restart_services
            ;;
        "status")
            show_status
            ;;
        "logs")
            show_logs "$2"
            ;;
        "rebuild")
            check_env_file
            rebuild_services
            ;;
        "images")
            show_images
            ;;
        "cleanup")
            cleanup
            ;;
        "clean-images")
            clean_images
            ;;
        "help"|*)
            show_help
            ;;
    esac
}

# Run main function with all arguments
main "$@"