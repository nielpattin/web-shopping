#!/bin/bash

# Deployment script for sonic-server and main-app
# This script builds Docker images, pushes them to the registry, and restarts Kubernetes deployments

set -e  # Exit on any error

echo "Starting deployment process..."

# Build Docker images
echo "Building Docker images..."
docker build -t nieltran/sonic-server:v1.0 sonic-server
docker build -t nieltran/main-app:v1.0 main-app

# Push Docker images to registry
echo "Pushing Docker images to registry..."
docker push nieltran/sonic-server:v1.0
docker push nieltran/main-app:v1.0

# Restart Kubernetes deployments
echo "Restarting Kubernetes deployments..."
kubectl rollout restart deployment/sonic-server-deployment
kubectl rollout restart deployment/main-app-deployment

echo "Deployment completed successfully!"