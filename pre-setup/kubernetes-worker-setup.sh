#!/bin/bash

# Kubernetes Cluster Setup Script
# This script sets up the common components needed on all nodes (master and worker)
# Run this script on all VMs first, then run the appropriate master/worker specific scripts

set -e

echo "🚀 Starting Kubernetes Cluster Setup..."

# 1. Disable Swap
echo "📋 Step 1: Disabling swap..."
sudo swapoff -a
sudo sed -i '/ swap / s/^\(.*\)$/#\1/g' /etc/fstab
echo "✅ Swap disabled"

# 2. Enable IPv4 packet forwarding
echo "📋 Step 2: Enabling IPv4 packet forwarding..."
sudo sysctl net.ipv4.ip_forward

# Create sysctl configuration for Kubernetes
cat <<EOF | sudo tee /etc/sysctl.d/k8s.conf
net.ipv4.ip_forward = 1
EOF

# Apply sysctl params without reboot
sudo sysctl --system
echo "✅ IPv4 packet forwarding enabled"

# 3. Install containerd as CRI runtime
echo "📋 Step 3: Installing containerd..."

# 3.1 Download and install containerd binary
if [ ! -f "containerd-2.1.1-linux-amd64.tar.gz" ]; then
  echo "Downloading containerd..."
  wget https://github.com/containerd/containerd/releases/download/v2.1.1/containerd-2.1.1-linux-amd64.tar.gz
else
  echo "containerd archive already exists, skipping download..."
fi
tar xvf containerd-2.1.1-linux-amd64.tar.gz
sudo mv bin/* /usr/local/bin/

# Check if containerd is installed
containerd --version

# Set up systemd service for containerd
sudo mkdir -p /usr/local/lib/systemd/system
if [ ! -f "containerd.service" ]; then
  echo "Downloading containerd service file..."
  wget https://raw.githubusercontent.com/containerd/containerd/main/containerd.service
else
  echo "containerd.service already exists, skipping download..."
fi
sudo mv containerd.service /usr/local/lib/systemd/system/

# Start containerd via systemd
sudo systemctl daemon-reload
sudo systemctl enable --now containerd
echo "✅ containerd installed and started"

# 3.2 Install runc
echo "📋 Step 3.2: Installing runc..."
if [ ! -f "runc.amd64" ]; then
  echo "Downloading runc..."
  wget https://github.com/opencontainers/runc/releases/download/v1.3.0/runc.amd64
else
  echo "runc.amd64 already exists, skipping download..."
fi
sudo install -m 755 runc.amd64 /usr/local/sbin/runc
sudo runc --version
echo "✅ runc installed"

# 3.3 Install CNI plugins
echo "📋 Step 3.3: Installing CNI plugins..."
if [ ! -f "cni-plugins-linux-amd64-v1.7.1.tgz" ]; then
  echo "Downloading CNI plugins..."
  wget https://github.com/containernetworking/plugins/releases/download/v1.7.1/cni-plugins-linux-amd64-v1.7.1.tgz
else
  echo "CNI plugins archive already exists, skipping download..."
fi
sudo mkdir -p /opt/cni/bin
sudo tar Cxzvf /opt/cni/bin cni-plugins-linux-amd64-v1.7.1.tgz
echo "✅ CNI plugins installed"

# 3.4 Configure containerd
echo "📋 Step 3.4: Configuring containerd..."
sudo mkdir -p /etc/containerd
sudo containerd config default | sudo tee /etc/containerd/config.toml > /dev/null

# 3.5 Restart containerd
sudo systemctl restart containerd
sudo systemctl status containerd --no-pager
echo "✅ containerd configured and restarted"

# 4. Install kubeadm, kubelet, and kubectl
echo "📋 Step 4: Installing kubeadm, kubelet, and kubectl..."

# 4.1 Update apt and install prerequisites
sudo apt-get update
sudo apt-get install -y apt-transport-https ca-certificates curl gpg

# 4.2 Download Kubernetes signing key
if [ ! -f "/etc/apt/keyrings/kubernetes-apt-keyring.gpg" ]; then
  echo "Downloading Kubernetes signing key..."
  curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.33/deb/Release.key | sudo gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg
else
  echo "Kubernetes GPG key already exists, skipping download..."
fi

# 4.3 Add Kubernetes apt repository
echo 'deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.33/deb/ /' | sudo tee /etc/apt/sources.list.d/kubernetes.list

# 4.4 Install kubeadm, kubelet, and kubectl
sudo apt-get update
sudo apt-get install -y kubelet kubeadm kubectl
sudo apt-mark hold kubelet kubeadm kubectl

# 4.5 Enable and start kubelet
sudo systemctl enable --now kubelet
echo "✅ kubeadm, kubelet, and kubectl installed"

# Keep downloaded files for potential re-use
echo "📋 Downloaded files preserved for future re-runs"
rm -rf bin  # Only remove the extracted bin directory
echo "✅ Temporary extraction cleanup completed"

echo "🎉 Common Kubernetes setup completed successfully!"
echo "📝 Next steps:"
echo "   - On master node: Run 'bash kubernetes-master-complete.sh'"
echo "   - On worker nodes: Run the kubeadm join command provided by master init"
echo "If you forgot to copy the join command, you can run this to create a new one:"
echo "   - On master node: 'kubeadm token create --print-join-command'"