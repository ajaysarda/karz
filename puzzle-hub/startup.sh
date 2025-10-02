#!/bin/bash

# Puzzle Hub Startup Script
# Usage: ./startup.sh [port]
# If no port is provided, uses PORT environment variable or defaults to 8080

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${BLUE}================================${NC}"
    echo -e "${BLUE}🎮 Puzzle Hub Startup Script${NC}"
    echo -e "${BLUE}================================${NC}"
}

# Print header
print_header

# Determine port
if [ -n "$1" ]; then
    # Port provided as argument
    export PORT=$1
    print_status "Using port from argument: $PORT"
elif [ -n "$PORT" ]; then
    # Port from environment variable
    print_status "Using port from environment: $PORT"
else
    # Default port
    export PORT=8080
    print_status "Using default port: $PORT"
fi

# Check if port is valid
if ! [[ "$PORT" =~ ^[0-9]+$ ]] || [ "$PORT" -lt 1 ] || [ "$PORT" -gt 65535 ]; then
    print_error "Invalid port number: $PORT"
    print_error "Port must be a number between 1 and 65535"
    exit 1
fi

# Check if port is already in use
if command -v lsof >/dev/null 2>&1; then
    if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
        print_warning "Port $PORT is already in use"
        print_warning "Attempting to start anyway (process may fail)"
    fi
fi

# Set AI provider if not set
if [ -z "$AI_PROVIDER" ]; then
    export AI_PROVIDER="fallback"
    print_status "AI_PROVIDER not set, using fallback mode"
else
    print_status "Using AI provider: $AI_PROVIDER"
fi

# Check for API keys if using AI providers
if [ "$AI_PROVIDER" = "openai" ] && [ -z "$OPENAI_API_KEY" ]; then
    print_error "OPENAI_API_KEY is required when using OpenAI provider"
    print_error "Set the environment variable or use AI_PROVIDER=fallback"
    exit 1
fi

if [ "$AI_PROVIDER" = "perplexity" ] && [ -z "$PERPLEXITY_API_KEY" ]; then
    print_error "PERPLEXITY_API_KEY is required when using Perplexity provider"
    print_error "Set the environment variable or use AI_PROVIDER=fallback"
    exit 1
fi

# Check if Go is installed
if ! command -v go >/dev/null 2>&1; then
    print_error "Go is not installed or not in PATH"
    print_error "Please install Go from https://golang.org/dl/"
    exit 1
fi

# Check Go version
GO_VERSION=$(go version | cut -d' ' -f3 | sed 's/go//')
print_status "Go version: $GO_VERSION"

# Check if main.go exists
if [ ! -f "main.go" ]; then
    print_error "main.go not found in current directory"
    print_error "Please run this script from the puzzle-hub directory"
    exit 1
fi

# Create cache directory if it doesn't exist
if [ ! -d "cache" ]; then
    mkdir -p cache
    print_status "Created cache directory"
fi

# Download dependencies if needed
if [ ! -f "go.sum" ] || [ "go.mod" -nt "go.sum" ]; then
    print_status "Downloading Go dependencies..."
    go mod tidy
    if [ $? -ne 0 ]; then
        print_error "Failed to download dependencies"
        exit 1
    fi
fi

# Set production mode for Gin if not in development
if [ -z "$GIN_MODE" ] && [ "$NODE_ENV" = "production" ]; then
    export GIN_MODE=release
    print_status "Set GIN_MODE to release for production"
fi

# Print startup information
print_status "Starting Puzzle Hub..."
print_status "Port: $PORT"
print_status "AI Provider: $AI_PROVIDER"
print_status "Environment: ${NODE_ENV:-development}"

# Check if this is a Render deployment
if [ -n "$RENDER" ]; then
    print_status "Detected Render deployment"
    export GIN_MODE=release
fi

# Check if this is a Heroku deployment
if [ -n "$DYNO" ]; then
    print_status "Detected Heroku deployment"
    export GIN_MODE=release
fi

# Start the application
print_status "🚀 Launching Puzzle Hub on port $PORT..."
echo -e "${GREEN}Visit http://localhost:$PORT to access the application${NC}"
echo ""

# Run the application
exec go run main.go
