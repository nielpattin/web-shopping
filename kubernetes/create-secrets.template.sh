#!/bin/bash

echo "Creating Kubernetes secrets sonic-server-secret.yaml file..."

# Replace these with your actual values during deployment
MONGO_URI="mongodb://admin:admin123@35.187.226.30:27017/?directConnection=true"
SONIC_AUTH="123123"

# Create the secret file
kubectl create secret generic sonic-server-secret \
  --from-literal=mongo-uri="$MONGO_URI" \
  --from-literal=sonic-auth="$SONIC_AUTH" \
  --dry-run=client -o yaml > kubernetes/sonic-server-secret.yaml
  
echo "Secret sonic-server-secret.yaml file created successfully!"