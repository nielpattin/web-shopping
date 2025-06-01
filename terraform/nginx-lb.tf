# External Nginx Load Balancer VM
resource "google_compute_instance" "nginx_lb" {
  boot_disk {
    auto_delete = true
    device_name = "nginx-lb-vm"

    initialize_params {
      image = "projects/debian-cloud/global/images/debian-12-bookworm-v20250513"
      size  = 20
      type  = "pd-standard"
    }

    mode = "READ_WRITE"
  }

  can_ip_forward      = false
  deletion_protection = false
  enable_display      = false

  labels = {
    goog-ec-src = "vm_add-tf"
    role        = "nginx-lb"
  }

  machine_type = "e2-small"  # Smaller instance for load balancer
  name         = "nginx-lb"

  metadata = {
    ssh-keys = "niel:${file("~/.ssh/niel_rsa.pub")}"
  }

  network_interface {
    access_config {
      network_tier = "STANDARD"
    }

    queue_count = 0
    stack_type  = "IPV4_ONLY"
    subnetwork  = "projects/complete-energy-407006/regions/asia-east2/subnetworks/default"
  }

  scheduling {
    automatic_restart   = false
    on_host_maintenance = "TERMINATE"
    preemptible         = true
    provisioning_model  = "SPOT"
  }

  shielded_instance_config {
    enable_integrity_monitoring = false
    enable_secure_boot          = false
    enable_vtpm                 = false
  }

  tags = ["http-server", "https-server", "nginx-lb"]
  zone = "asia-east2-a"
}

# Firewall rule for Nginx Load Balancer
resource "google_compute_firewall" "nginx_lb_http" {
  name    = "nginx-lb-http-access"
  network = "default"

  allow {
    protocol = "tcp"
    ports    = ["80", "443"]
  }

  target_tags   = ["nginx-lb"]
  source_ranges = ["0.0.0.0/0"]
}