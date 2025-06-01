# Output the external IPs of all machines
output "machine_external_ips" {
  description = "External IP addresses of all Kubernetes machines"
  value = [
    for instance in google_compute_instance.machine :
    instance.network_interface[0].access_config[0].nat_ip
  ]
}

# Output the internal IPs of all machines
output "machine_internal_ips" {
  description = "Internal IP addresses of all Kubernetes machines"
  value = [
    for instance in google_compute_instance.machine :
    instance.network_interface[0].network_ip
  ]
}

# Output master node specific information
output "master_external_ip" {
  description = "External IP of the master node (machine-0)"
  value       = google_compute_instance.machine[0].network_interface[0].access_config[0].nat_ip
}

output "master_internal_ip" {
  description = "Internal IP of the master node (machine-0)"
  value       = google_compute_instance.machine[0].network_interface[0].network_ip
}

# Output worker nodes information
output "worker_external_ips" {
  description = "External IPs of worker nodes (machine-1, machine-2)"
  value = [
    for i in range(1, length(google_compute_instance.machine)) :
    google_compute_instance.machine[i].network_interface[0].access_config[0].nat_ip
  ]
}

output "worker_internal_ips" {
  description = "Internal IPs of worker nodes (machine-1, machine-2)"
  value = [
    for i in range(1, length(google_compute_instance.machine)) :
    google_compute_instance.machine[i].network_interface[0].network_ip
  ]
}

# Output the load balancer's external IP
output "nginx_lb_external_ip" {
  description = "External IP address of the Nginx load balancer"
  value       = google_compute_instance.nginx_lb.network_interface[0].access_config[0].nat_ip
}