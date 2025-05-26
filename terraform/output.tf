output "public_ips" {
  description = "Public IP addresses of the VM instances"
  value       = google_compute_instance.machine[*].network_interface[0].access_config[0].nat_ip
}