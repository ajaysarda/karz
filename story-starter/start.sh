#!/bin/bash

# Story Starter Generator - Quick Start Script

echo "🎨 Story Starter Generator - Starting..."
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ .env file not found!"
    echo "Creating .env from env.example..."
    cp env.example .env
    echo "✅ .env file created!"
    echo ""
    echo "⚠️  IMPORTANT: Please edit .env and add your PERPLEXITY_API_KEY"
    echo ""
    read -p "Press enter after you've added your API key to .env..."
fi

# Check if PERPLEXITY_API_KEY is set
source .env
if [ -z "$PERPLEXITY_API_KEY" ] || [ "$PERPLEXITY_API_KEY" = "your_perplexity_api_key_here" ]; then
    echo "❌ PERPLEXITY_API_KEY is not set in .env file"
    echo "Please edit .env and add your Perplexity API key"
    exit 1
fi

echo "✅ Configuration loaded"
echo ""

# Download dependencies if needed
if [ ! -d "vendor" ]; then
    echo "📦 Installing dependencies..."
    go mod download
    echo "✅ Dependencies installed"
    echo ""
fi

# Build the application
echo "🔨 Building application..."
go build -o story-starter main.go
if [ $? -ne 0 ]; then
    echo "❌ Build failed"
    exit 1
fi
echo "✅ Build successful"
echo ""

# Start the server
echo "🚀 Starting Story Starter Generator..."
echo "📱 Open your browser to: http://localhost:${PORT:-8080}"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

./story-starter

