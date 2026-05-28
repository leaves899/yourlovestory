#!/bin/bash
# Build and run yourcrush in Docker

set -e

echo "Building yourcrush Docker image..."
docker-compose build

echo ""
echo "Starting yourcrush..."
echo "Run 'docker-compose up -d' to start in background"
echo "Run 'docker-compose exec yourcrush bash' to get shell"
echo "Run 'docker-compose down' to stop"
echo ""

docker-compose up