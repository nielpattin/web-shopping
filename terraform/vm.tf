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
  tags = ["ssh", "http", "https"]
  zone = "asia-east2-a"
}

resource "google_compute_firewall" "ssh" {
  name    = "ssh-access"
  network = "default"

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  target_tags = ["ssh"]
  source_ranges = ["0.0.0.0/0"]
}