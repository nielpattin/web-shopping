## Kubernetes Cluster Installation Guide

This guide provides scripts to set up a Kubernetes cluster on multiple VMs.

### Prerequisites
- 3 VMs running Debian 12 bookworm
- Root or sudo access on all VMs
- Network connectivity between VMs

### Installation Steps

#### Step 1: Run Worker Setup on Worker Nodes
SSH into each worker node (machine-1, machine-2, etc) and copy the entire content of `kubernetes-worker-setup.sh`, then paste it directly into the terminal and press Enter to execute.

Alternatively, you can copy the file to each worker node and run it:

```bash
scp kubernetes-worker-setup.sh <user>@<worker-ip>:/home/<user>/
chmod +x kubernetes-worker-setup.sh
bash kubernetes-worker-setup.sh
```

This script will:
- Disable swap
- Enable IPv4 packet forwarding
- Install containerd, runc, and CNI plugins
- Install kubeadm, kubelet, and kubectl

#### Step 2: Initialize Master Node
SSH into the master node and copy the entire content of `kubernetes-master-setup.sh`, then paste it directly into the terminal and press Enter to execute.

This script will:
- Run all common setup steps(same as worker setup)
- Initialize the Kubernetes cluster with `kubeadm init --pod-network-cidr=192.168.0.0/16 --apiserver-advertise-address=<master-ip>`
- Configure kubectl for the regular user (otherwise you will get `"The connection to the server localhost:8080 was refused"` error)
- Install Calico CNI networking (v3.30.0) for pod networking to make cluster communication
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

#### Step 5: Optional - Verify Calico Installation
Verify Calico installation and check pod status:

```bash
kubectl get pods -n calico-system
```

(Optional) Monitor Calico system status:
```bash
watch kubectl get pods -n calico-system
```

### Common Issues

1. **Nodes show "NotReady" status**
   - Wait for Calico to be fully deployed
   - Check with: `kubectl get pods -n calico-system`

2. **kubeadm join fails**
   - Verify network connectivity between nodes
   - Check if the token has expired (tokens expire after 24 hours)
   - Generate new token: `kubeadm token create --print-join-command`

### Accessing Cluster from Local Machine

To access the cluster from your local machine:

1. Copy kubeconfig from master node:
```bash
scp -i <ssh-key> <user>@<master-external-ip>:/home/<user>/.kube/config ~/.kube/admin.conf
```

2. Open the kubeconfig file:
This file is typically located at `~/.kube/admin.conf`. You can edit it using:
vi, nano, nvim, code,...
```bash
vi ~/.kube/admin.conf
```
3. Update the server address to the master node's IP:
```yaml
clusters:
- cluster:
    server: https://<master-external-ip>:6443
```
4. Save and exit the file.

5. Set environment variable:
```bash
export KUBECONFIG=~/.kube/admin.conf
```

6. Verify connection:
This command should return the list of nodes in the cluster on the master node:
```bash
kubectl get nodes
```

### Next Steps

After cluster setup, you can:
- Deploy applications using kubectl
- Install additional add-ons (metrics-server, dashboard, etc.)
- Configure ingress controllers for external access
- Set up persistent storage solutions

### Resources
- [Official Kubernetes Documentation](https://kubernetes.io/docs/)
- [Calico Documentation](https://docs.tigera.io/calico/latest/)
- [kubeadm Documentation](https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/)
- [Containerd Documentation](https://containerd.io/docs/)