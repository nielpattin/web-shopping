#!/bin/bash

echo "Creating Kubernetes secrets sonic-server-secret.yaml file..."

# Replace these with your actual values during deployment
MONGO_URI="mongodb://YOUR_USER:YOUR_PASSWORD@YOUR_HOST:27017/YOUR_DATABASE?authSource=admin"
SONIC_AUTH="YOUR_SONIC_PASSWORD"

# Create the secret file
kubectl create secret generic sonic-server-secret \
  --from-literal=mongo-uri="$MONGO_URI" \
  --from-literal=sonic-auth="$SONIC_AUTH" \
  --dry-run=client -o yaml > kubernetes/sonic-server-secret.yaml
  
echo "Secret sonic-server-secret.yaml file created successfully!"