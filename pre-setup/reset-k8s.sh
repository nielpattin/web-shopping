#!/bin/bash

# Clean up any previous Kubernetes installation
echo "📋(Optional) Step 5: Cleaning up previous Kubernetes installation..." 
sudo kubeadm reset --force
sudo rm -rf /etc/cni/net.d/
sudo iptables -F && sudo iptables -t nat -F && sudo iptables -t mangle -F && sudo iptables -X
sudo ipvsadm --clear 2>/dev/null || true  # If you're using IPVS (common for kube-proxy since 1.11+)
sudo rm -f $HOME/.kube/config /root/.kube/config
echo "✅ Previous installation cleaned up"