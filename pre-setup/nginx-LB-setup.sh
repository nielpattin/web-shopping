#!/bin/bash

# Nginx Load Balancer Setup Script for Ingress-NGINX Controller
# This script configures Nginx to route traffic through ingress-nginx controller

set -e

# Update system packages
sudo apt-get update
sudo apt-get install -y nginx

# Create backup of default config
sudo cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.backup

# Get the internal IPs of Kubernetes nodes
# These will be replaced with actual IPs during deployment
K8S_NODE_1="10.170.0.21"  # machine-0 (master)
K8S_NODE_2="10.170.0.22"  # machine-1 (worker)
K8S_NODE_3="10.170.0.23"  # machine-2 (worker)

# Create Nginx configuration for load balancing to ingress-nginx controller
sudo tee /etc/nginx/sites-available/k8s-lb > /dev/null << EOF
# Upstream configuration for Kubernetes ingress-nginx controller NodePort
upstream k8s_server {
    # Health checks and load balancing to ingress-nginx controller on all nodes
    # Port 30639 is the ingress-nginx-controller HTTP NodePort
    server ${K8S_NODE_1}:30639 max_fails=3 fail_timeout=30s;
    server ${K8S_NODE_2}:30639 max_fails=3 fail_timeout=30s;
    server ${K8S_NODE_3}:30639 max_fails=3 fail_timeout=30s;
}

# Main server block for HTTP traffic
server {
    listen 80;
    server_name _;  # Accept all hostnames

    # Health check endpoint
    location /health {
        access_log off;
        return 200 "healthy\\n";
        add_header Content-Type text/plain;
    }

    # Main proxy configuration - route to ingress-nginx controller
    location / {
        proxy_pass http://k8s_server;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Port \$server_port;
        
        # Connection settings
        proxy_connect_timeout 30s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;
        
        # Buffer settings
        proxy_buffering on;
        proxy_buffer_size 4k;
        proxy_buffers 8 4k;
        
        # Health check
        proxy_next_upstream error timeout invalid_header http_500 http_502 http_503 http_504;
    }
}
EOF

# Enable the new site
sudo ln -sf /etc/nginx/sites-available/kubernetes-ingress-lb /etc/nginx/sites-enabled/kubernetes-ingress-lb

# Remove old configuration and default site
sudo rm -f /etc/nginx/sites-enabled/kubernetes-lb
sudo rm -f /etc/nginx/sites-enabled/default

# Test Nginx configuration
sudo nginx -t

# Enable and start Nginx
sudo systemctl enable nginx
sudo systemctl restart nginx

echo "To test health: curl http://localhost/health"