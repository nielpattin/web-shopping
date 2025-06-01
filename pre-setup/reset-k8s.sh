#!/bin/bash

# Clean up any previous Kubernetes installation
echo "📋 Step 5: Cleaning up previous Kubernetes installation..." 
sudo kubeadm reset --force # Reset kubeadm state
sudo rm -rf /etc/cni/net.d/ # Remove CNI network configurations
sudo iptables -F && sudo iptables -t nat -F && sudo iptables -t mangle -F && sudo iptables -X # Flush iptables rules
sudo ipvsadm --clear 2>/dev/null || true # Clear IPVS rules if ipvsadm is installed
sudo rm -rf $HOME/.kube # Remove kube config directory
echo "✅ Previous installation cleaned up"