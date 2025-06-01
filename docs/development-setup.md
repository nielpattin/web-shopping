# Development Setup Guide (Minikube)

This guide provides concise instructions for setting up a local Kubernetes development environment using Minikube.

## 1. Prerequisites

Before installing Minikube, ensure you have:
*   A container or virtual machine manager, such as:
    *   Docker
*   `kubectl` (Kubernetes command-line tool). Install if not present: [Install kubectl](https://kubernetes.io/docs/tasks/tools/install-kubectl-linux/)

## 2. Install Minikube

Choose the method for your operating system:

**Linux (x86-64):**
```bash
curl -LO https://storage.googleapis.com/minikube/releases/latest/minikube-linux-amd64
sudo install minikube-linux-amd64 /usr/local/bin/minikube
```

For other installation methods, see the [official Minikube documentation](https://minikube.sigs.k8s.io/docs/start/).

## 3. Start Minikube Cluster

Start your local Kubernetes cluster:
```bash
minikube start
```
You can specify a driver if needed (e.g., `minikube start --driver=docker`).

## 4. Interact with Your Cluster

*   **Configure `kubectl`:** Minikube usually configures `kubectl` automatically. If not, run `minikube kubectl -- config view`.
*   **Get Cluster IP:**
```bash
minikube ip
```
*   **Access Minikube Dashboard:**
```bash
minikube dashboard
```

## 5. Deploy Your Application

Once Minikube is running, deploy your application's Kubernetes manifests:
```bash
kubectl apply -f kubernetes/
```
(Adapt the paths above to your project's manifest locations.)

## 6. Access Your Application

To access the deployed application (e.g., via an Nginx service):
```bash
kubectl port-forward service/nginx 8080:80
```
Then, open your browser and navigate to `http://localhost:8080`.

Alternatively, for services of type `LoadBalancer` or `NodePort`, you can use:
```bash
minikube service <your-service-name>
```
This will open the service URL in your browser.

## 7. (Optional) Using Minikube's Docker Daemon

To build Docker images directly within Minikube's Docker environment (avoids pushing to a remote registry for local development):
```bash
eval $(minikube -p minikube docker-env)
```
Run this command in each terminal where you intend to build and use local images with Minikube.
To revert, use `eval $(minikube -p minikube docker-env -u)`.

## 8. Manage Minikube Cluster

*   **Stop the cluster:**
```bash
minikube stop
```
*   **Delete the cluster:**
```bash
minikube delete
```