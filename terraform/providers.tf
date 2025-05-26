provider "google" {
  project = local.project_id
  region  = local.region
}

terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "6.36.1"
    }
  }

  required_version = ">= 1.5.0"
}