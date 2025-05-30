# Production Setup Guide


## Project Overview

### From start to finish, the project includes:
1. **Sonic Server**: A gRPC server that handles product search and order processing.
2. **Main Application**: A web application that provides the user interface for browsing products and placing orders.
3. **Nginx**: A reverse proxy server that routes requests to the main application and Sonic server.
4. **MongoDB**: A NoSQL database for storing product and order data.

## Deployment Guide for Distributed Web App Shopping

### Step 1: Docker setup on your machine
1. **Install Docker**: Follow the official [Docker installation guide](https://docs.docker.com/get-docker/) for your operating system.

### Step 2: Setup Google Cloud VM
- Install gcloud SDK: Follow the official [Google Cloud SDK installation guide](https://cloud.google.com/sdk/docs/install-sdk).
- Make sure you have a Google Cloud account and have created a project.
- After installed, init, auth we gonna use Terraform to create VM instances

### Step 3: Setup Terraform
- Install Terraform: Follow the official [Terraform installation guide](https://developer.hashicorp.com/terraform/install)
- cd to terraform directory
```bash
cd terraform
```
- run the following commands to create VM instances
```bash
terraform init # Initialize the Terraform configuration
terraform plan # Review the plan to see what resources will be created
terraform apply # Apply the configuration to create the resources
```

### Step 4: Setup Kubernetes on VM instances
For detailed instructions on setting up Kubernetes on VM instances, please refer to the [Kubernetes Cluster Installation Guide](docs/kubernetes-cluster-installation-guide.md).

### Step 5: Deploy the application
- cd to the kubernetes directory
```bash
cd kubernetes
```
- Run the following command to deploy the application:
```bash
kubectl apply -f .
```
- This command will create all the necessary resources in your Kubernetes cluster, including deployments, services, and ingress rules.

## Kubernetes Deployment Guide

### Build and Distribute Docker Images

```bash
# Build images replace `nieltran` with your Docker Hub org or username 
docker build -t nieltran/main-app:v1.0 main-app
docker build -t nieltran/sonic-server:v1.0 sonic-server

# Build and push to registry
docker push nieltran/main-app:v1.0
docker push nieltran/sonic-server:v1.0

```
### Create Secrets

#### Create Secrets (Important: Contains Sensitive Data)
```bash
# First, copy and customize the template with your actual credentials
cp kubernetes/create-secrets.template.sh kubernetes/create-secrets.sh
```

### Deploy to Kubernetes

#### Deploy All at Once
```bash
kubectl apply -f kubernetes/
```

#### Check Services
```bash
kubectl get services
# Expected output:
# NAME           TYPE           CLUSTER-IP     EXTERNAL-IP   PORT(S)
# sonic-server   LoadBalancer   10.96.x.x      <pending>     50051:30xxx/TCP
# main-app       LoadBalancer   10.96.x.x      <pending>     80:30xxx/TCP
# nginx          Service        10.96.x.x      <pending>     80:30xxx/TCP
```

#### Check Pods
```bash
kubectl get pods
# All pods should be Running

# Check specific pod status
kubectl rollout status deployment/sonic-server-deployment
kubectl rollout status deployment/main-app-deployment
kubectl rollout status deployment/nginx-deployment
```


#### Useful Commands
```bash

# Execute into a pod for debugging
kubectl exec -it <pod-name> -- /bin/sh

# Port forward for local testing
kubectl port-forward service/main-app 8080:80
```

### Expected Service Connectivity

After deployment, the connectivity flow will be:

```
User Browser → main-app Service (port 80) → main-app Pods (port 3030)
                    ↓
main-app Pods → sonic-server Service (port 50051) → sonic-server Pods (port 50051)
                    ↓  
sonic-server Pods → MongoDB (external, port 27017)
```



