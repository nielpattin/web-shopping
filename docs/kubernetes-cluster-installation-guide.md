## Kubernetes Cluster Installation Guide

This guide provides scripts to set up a Kubernetes cluster on multiple VMs.

### Prerequisites
- 4 VMs running Debian 12 bookworm
- 1 is Load Balancer other 3 are in the cluster (1 master, 2 workers)
- Root or sudo access on all VMs
- Network connectivity between VMs (same VPC)

### Installation Steps

#### Step 1: Run Worker Setup on Worker Nodes
SSH into each worker node (machine-1, machine-2, etc) and copy the entire content of [kubernetes-worker-setup.sh](../pre-setup/kubernetes-worker-setup.sh), then paste it directly into the terminal and press Enter to execute.

This script will:
- Disable swap
- Enable IPv4 packet forwarding
- Install containerd, runc, and CNI plugins
- Install kubeadm, kubelet, and kubectl

#### Step 2: Initialize Master Node
SSH into the master node and copy the entire content of [kubernetes-master-setup.sh](../pre-setup/kubernetes-master-setup.sh), then paste it directly into the terminal and press Enter to execute.

This script will:
- Run all common setup steps(same as worker setup)
- Initialize the Kubernetes cluster with `kubeadm init`
- Configure kubectl for the regular user (otherwise you will get `"The connection to the server localhost:8080 was refused"` error)
- Install Cilium for pod networking to make cluster communication
- Display the join command for worker nodes

#### Step 3: Run the join command provided by the master initialization on the worker nodes:

```bash
sudo kubeadm join <master-ip>:6443 --token <token> --discovery-token-ca-cert-hash sha256:<hash>
```

#### Step 4: Verify Cluster
On the master node, verify all nodes are ready:

```bash
kubectl get nodes
```

Expected output:
```
NAME        STATUS   ROLES           AGE   VERSION
machine-0   Ready    control-plane   10m   v1.33.1
machine-1   Ready    <none>          5m    v1.33.1
machine-2   Ready    <none>          5m    v1.33.1
```

### Common Issues
#### 1. **kubeadm join fails**
   - Verify network connectivity between nodes
   - Check if the token has expired (tokens expire after 24 hours)
   - Generate new token: `kubeadm token create --print-join-command`

### Accessing Cluster from Local Machine

To access the cluster from your local machine:

##### 1. Change server address in kubeconfig file to the master node's external IP.
```bash
EXTERNAL_IP=$(curl -s -H "Metadata-Flavor: Google" http://metadata/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip)
KUBECONFIG_PATH="/home/niel/.kube/config"
CURRENT_IP=$(grep -oP 'server: https://\K[^:]+' "$KUBECONFIG_PATH")
echo "🔄 Replacing $CURRENT_IP with $EXTERNAL_IP in kubeconfig..."
sed -i "s|server: https://$CURRENT_IP:6443|server: https://$EXTERNAL_IP:6443|g" "$KUBECONFIG_PATH"
NEW_SERVER=$(grep "server:" "$KUBECONFIG_PATH")
echo "✅ Updated server: $NEW_SERVER"
```

##### 2. Copy kubeconfig from master node:
```bash
scp <user>@<master-external-ip>:/home/<user>/.kube/config ~/.kube/admin.conf
```

##### 3. Set environment variable:
```bash
export KUBECONFIG=~/.kube/admin.conf
```

##### 4. Verify connection:
This command should return the list of nodes in the cluster on the master node:
```bash
kubectl get nodes
```

### Accessing the Kubernetes Dashboard

1. **Install the Kubernetes Dashboard**
```bash
# Add kubernetes-dashboard repository
helm repo add kubernetes-dashboard https://kubernetes.github.io/dashboard/
# Deploy a Helm Release named "kubernetes-dashboard" using the kubernetes-dashboard chart
helm upgrade --install kubernetes-dashboard kubernetes-dashboard/kubernetes-dashboard --create-namespace --namespace kubernetes-dashboard
```

2.  **Access the Dashboard:**
Port-forward the Kubernetes Dashboard service to your local machine:
```bash
kubectl port-forward -n kubernetes-dashboard svc/kubernetes-dashboard-kong-proxy 8443:443
```
Then, open your web browser and navigate to:
```
http://localhost:8443/
```

3.  **Apply the Service Account Configuration:**
```bash
kubectl apply -f kubernetes/service-account.yml
```

4.  **Create the Token:**
Once the service account is correctly configured and applied in the `kube-system` namespace, create the token:
```bash
kubectl -n kube-system create token admin-user
```
This command will output the token string.

### Setup Ingress Controller

#### 1. Install Nginx Ingress Controller
```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.12.2/deploy/static/provider/cloud/deploy.yaml
```
#### 2. Verify Ingress Controller

```bash
kubectl get pods --namespace=ingress-nginx
# Make sure controller pods are running
```

### Resources
- [Official Kubernetes Documentation](https://kubernetes.io/docs/)
- [Cilium Documentation](https://docs.cilium.io/en/stable/gettingstarted/k8s-install-default/#install-the-cilium-cli)
- [kubeadm Documentation](https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/)
- [Containerd Documentation](https://containerd.io/docs/)
- [Ingress Nginx Documentation](https://kubernetes.github.io/ingress-nginx/)