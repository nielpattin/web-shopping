# This code is compatible with Terraform 4.25.0 and versions that are backwards compatible to 4.25.0.
# For information about validating this Terraform code, see https://developer.hashicorp.com/terraform/tutorials/gcp-get-started/google-cloud-platform-build#format-and-validate-the-configuration

resource "google_compute_instance" "machine" {
  count = 3 # Create 3 instances
  boot_disk {
    auto_delete = true
    device_name = "machine-vm-${count.index}"

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
  }

  machine_type = "e2-medium"
  name         = "machine-${count.index}"

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
  tags = ["http-server", "https-server", "kubernetes"]
  zone = "asia-east2-a"
}

# Kubernetes API Server port
resource "google_compute_firewall" "kubernetes_api" {
  name    = "kubernetes-api-access"
  network = "default"

  allow {
    protocol = "tcp"
    ports    = ["6443"]
  }

  target_tags   = ["kubernetes"]
  source_ranges = ["0.0.0.0/0"]
}

# etcd server client API ports
resource "google_compute_firewall" "etcd" {
  name    = "etcd-access"
  network = "default"

  allow {
    protocol = "tcp"
    ports    = ["2379", "2380"]
  }

  target_tags   = ["kubernetes"]
  source_ranges = ["0.0.0.0/0"]
}

# Kubelet API port
resource "google_compute_firewall" "kubelet" {
  name    = "kubelet-access"
  network = "default"

  allow {
    protocol = "tcp"
    ports    = ["10250"]
  }

  target_tags   = ["kubernetes"]
  source_ranges = ["0.0.0.0/0"]
}

# kube-scheduler port
resource "google_compute_firewall" "kube_scheduler" {
  name    = "kube-scheduler-access"
  network = "default"

  allow {
    protocol = "tcp"
    ports    = ["10259"]
  }

  target_tags   = ["kubernetes"]
  source_ranges = ["0.0.0.0/0"]
}

# kube-controller-manager port
resource "google_compute_firewall" "kube_controller_manager" {
  name    = "kube-controller-manager-access"
  network = "default"

  allow {
    protocol = "tcp"
    ports    = ["10257"]
  }

  target_tags   = ["kubernetes"]
  source_ranges = ["0.0.0.0/0"]
}

# kube-proxy port
resource "google_compute_firewall" "kube_proxy" {
  name    = "kube-proxy-access"
  network = "default"

  allow {
    protocol = "tcp"
    ports    = ["10256"]
  }

  target_tags   = ["kubernetes"]
  source_ranges = ["0.0.0.0/0"]
}

# NodePort services range (TCP)
resource "google_compute_firewall" "nodeport_tcp" {
  name    = "nodeport-tcp-access"
  network = "default"

  allow {
    protocol = "tcp"
    ports    = ["30000-32767"]
  }

  target_tags   = ["kubernetes"]
  source_ranges = ["0.0.0.0/0"]
}

# NodePort services range (UDP)
resource "google_compute_firewall" "nodeport_udp" {
  name    = "nodeport-udp-access"
  network = "default"

  allow {
    protocol = "udp"
    ports    = ["30000-32767"]
  }

  target_tags   = ["kubernetes"]
  source_ranges = ["0.0.0.0/0"]
}
