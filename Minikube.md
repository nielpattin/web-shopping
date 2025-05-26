### Get IP of the Minikube cluster

```bash
minikube ip
```

### Enabling Docker to push images to Minikube

```bash
minikube addon enable registry
```

### Map the registry to localhost

```bash
kubectl port-forward --namespace kube-system service/registry 5000:80

# Test it
curl http://localhost:5000/v2/_catalog
```

