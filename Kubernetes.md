- ClusterIP spec.type : Only allows communication only between services within the same cluster.
- NodePort spec.type : Exposes the service on each Node’s IP at a static port (the NodePort).
  - spec.ports.nodePort : The port on each node to expose the service.
  - Can only expose a single service per port.
  - Can only use ports in the range 30000-32767.
  - If Node IP is changed, need to update IP or DNS record.
  - DON'T use NodePort for production.
- LoadBalancer spec.type : Exposes the service externally using a cloud provider's load balancer.
  - It's the default type for services in cloud environments.
  - Doesn't provide filtering or routing.
  - Can send HTTP, TCP, UDP, WebSocket, and gRPC traffic.
  - DOWNSIDE: Need to create a load balancer service type for each application.
  - COST: Can be expensive.
- Ingress spec.type : Provides HTTP routing and filtering.
  - Can route traffic to multiple services based on the request path or host.
  - Can use TLS termination.
  - Can use a single load balancer for multiple services.
  - DOWNSIDE: Requires an Ingress controller to be installed in the cluster.
  - COST: Can be more cost-effective than using multiple LoadBalancer services.



### Type of Services

- **ClusterIP**: Default service type, only accessible within the cluster.
- **NodePort**: Exposes the service on each node's IP at a static port, allowing external access.
- **LoadBalancer**: Exposes the service externally using a cloud provider's load balancer.
  - This will create a load balancer that routes traffic to the service.
  - So, each service will have its own load balancer.
  - This will increase costs!
- **Ingress**: Provides HTTP routing and filtering, allowing multiple services to share a single load balancer.



### Ingress-Nginx-Controller

#### Installation
```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/cloud/deploy.yaml
```