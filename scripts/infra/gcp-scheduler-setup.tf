# GCP Cloud Scheduler + Cloud Build Trigger Setup
# Run: terraform init && terraform apply

terraform {
  required_version = ">= 1.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

variable "gcp_project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "gcp_region" {
  description = "GCP Region"
  type        = string
  default     = "asia-southeast1"
}

variable "cogotchi_service_url" {
  description = "Cloud Run cogotchi service URL"
  type        = string
  default     = "https://cogotchi-103912432221.asia-southeast1.run.app"
}

variable "scheduler_secret" {
  description = "SCHEDULER_SECRET from Cloud Run env"
  type        = string
  sensitive   = true
}

provider "google" {
  project = var.gcp_project_id
  region  = var.gcp_region
}

# Cloud Scheduler: feature_materialization (every 15 min)
resource "google_cloud_scheduler_job" "feature_materialization" {
  name             = "feature-materialization-run"
  description      = "Trigger feature materialization job every 15 minutes"
  schedule         = "*/15 * * * *"
  time_zone        = "UTC"
  region           = var.gcp_region
  attempt_deadline = "840s"

  http_target {
    http_method = "POST"
    uri         = "${var.cogotchi_service_url}/jobs/feature_materialization/run"

    headers = {
      "Authorization" = "Bearer ${var.scheduler_secret}"
      "Content-Type"  = "application/json"
    }

    body = base64encode("{}")
  }
}

# Cloud Scheduler: raw_ingest (every 60 min)
resource "google_cloud_scheduler_job" "raw_ingest" {
  name             = "raw-ingest-run"
  description      = "Trigger raw ingest job every hour"
  schedule         = "0 * * * *"
  time_zone        = "UTC"
  region           = var.gcp_region
  attempt_deadline = "3300s"

  http_target {
    http_method = "POST"
    uri         = "${var.cogotchi_service_url}/jobs/raw_ingest/run"

    headers = {
      "Authorization" = "Bearer ${var.scheduler_secret}"
      "Content-Type"  = "application/json"
    }

    body = base64encode("{}")
  }
}

output "scheduler_jobs" {
  value = {
    feature_materialization = google_cloud_scheduler_job.feature_materialization.name
    raw_ingest              = google_cloud_scheduler_job.raw_ingest.name
  }
  description = "Created Cloud Scheduler jobs"
}
