#!/bin/bash

# Complete Kubernetes Master Node Setup Script
# This script combines both common setup and master initialization
# Run this ONLY on the master node

set -e

echo "🚀 Starting Complete Kubernetes Master Node Setup..."

# Run common setup first
echo "📋 Phase 1: Running common setup..."

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

echo "📋 Phase 2: Initializing master node..."

# 5. Get VM External IP addresses from metadata server of Google Cloud
# If running on a different cloud provider, use "curl https://ipinfo.io/ip" or similar command to get the external IP
echo "📋 Step 6: Getting VM IP addresses..."
INTERNAL_IP=$(curl -H "Metadata-Flavor: Google" http://metadata/computeMetadata/v1/instance/network-interfaces/0/ip)
EXTERNAL_IP=$(curl -H "Metadata-Flavor: Google" http://metadata/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip)

# 6. Initialize the Kubernetes cluster
echo "📋 Step 6: Initializing Kubernetes cluster with Calico pod network CIDR..."
sudo kubeadm init \
  --pod-network-cidr=192.168.0.0/16 \
  --apiserver-advertise-address=$INTERNAL_IP \
  --apiserver-cert-extra-sans=$EXTERNAL_IP \

echo "✅ Kubernetes cluster initialized"

# 8. Configure kubectl for the regular user
echo "📋 Step 8: Configuring kubectl for regular user..."
mkdir -p $HOME/.kube
sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
sudo chown $(id -u):$(id -g) $HOME/.kube/config
echo "✅ kubectl configured for regular user"

# 9. Install Calico CNI
echo "📋 Step 9: Installing Calico operator CRDs and Tigera operator..."
kubectl create -f https://raw.githubusercontent.com/projectcalico/calico/v3.30.0/manifests/operator-crds.yaml
kubectl create -f https://raw.githubusercontent.com/projectcalico/calico/v3.30.0/manifests/tigera-operator.yaml
echo "✅ Tigera operator and CRDs installed"

# 10. Install Calico custom resources
echo "📋 Step 10: Downloading and installing Calico custom resources..."
if [ ! -f "custom-resources.yaml" ]; then
  echo "Downloading Calico custom resources..."
  curl https://raw.githubusercontent.com/projectcalico/calico/v3.30.0/manifests/custom-resources.yaml -O
else
  echo "custom-resources.yaml already exists, skipping download..."
fi
kubectl create -f custom-resources.yaml
echo "✅ Calico custom resources installed"

# Keep downloaded files for potential re-use
echo "📋 Downloaded files preserved for future re-runs"
rm -rf bin  # Only remove the extracted bin directory
echo "✅ Temporary extraction cleanup completed"

echo "🎉 Complete master node setup finished successfully!"
echo ""
echo "📝 IMPORTANT: Save the kubeadm join command from the output above!"
echo "📝 Run the join command on each worker node to add them to the cluster."
echo ""
echo "📋 To verify the cluster after adding worker nodes:"
echo "   kubectl get nodes"
echo ""
echo "📋 Optional: Verify Calico installation after all nodes are ready:"
echo "   kubectl get pods -n calico-system"
echo "   kubectl get nodes -o wide"
echo ""
echo "📋 Optional: Monitor Calico status:"
echo "   watch kubectl get pods -n calico-system"