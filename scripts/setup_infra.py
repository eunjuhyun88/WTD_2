#!/usr/bin/env python3
"""
Infrastructure Setup — Cloud Scheduler + Vercel Environment Variable
Direct API calls (no Terraform/bash)

Usage:
    python scripts/setup_infra.py \
        --gcp-project YOUR_PROJECT_ID \
        --scheduler-secret YOUR_SECRET \
        --encryption-key YOUR_64_HEX_KEY \
        --vercel-token YOUR_VERCEL_TOKEN
"""

import os
import sys
import argparse
import logging
from typing import Optional

# Setup logging
logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


def setup_gcp_scheduler(
    project_id: str,
    region: str = "asia-southeast1",
    scheduler_secret: Optional[str] = None,
    cogotchi_url: str = "https://cogotchi-103912432221.asia-southeast1.run.app",
) -> bool:
    """Setup Cloud Scheduler jobs via google-cloud-scheduler API."""
    try:
        from google.cloud import scheduler_v1
    except ImportError:
        logger.error("❌ google-cloud-scheduler not installed")
        logger.info("   Install with: pip install google-cloud-scheduler")
        return False

    try:
        client = scheduler_v1.CloudSchedulerClient()
        parent = client.common_project_path(project_id, region)

        if not scheduler_secret:
            logger.warning("⚠️  No SCHEDULER_SECRET provided, skipping Cloud Scheduler setup")
            return False

        # Job 1: feature_materialization (every 15 min)
        job1 = scheduler_v1.Job(
            name=f"{parent}/jobs/feature-materialization-run",
            http_target=scheduler_v1.HttpTarget(
                uri=f"{cogotchi_url}/jobs/feature_materialization/run",
                http_method=scheduler_v1.HttpMethod.POST,
                headers={
                    "Authorization": f"Bearer {scheduler_secret}",
                    "Content-Type": "application/json",
                },
                body=b"{}",
            ),
            schedule="*/15 * * * *",
            time_zone="UTC",
            attempt_deadline={"seconds": 840},
        )

        # Job 2: raw_ingest (every 60 min)
        job2 = scheduler_v1.Job(
            name=f"{parent}/jobs/raw-ingest-run",
            http_target=scheduler_v1.HttpTarget(
                uri=f"{cogotchi_url}/jobs/raw_ingest/run",
                http_method=scheduler_v1.HttpMethod.POST,
                headers={
                    "Authorization": f"Bearer {scheduler_secret}",
                    "Content-Type": "application/json",
                },
                body=b"{}",
            ),
            schedule="0 * * * *",
            time_zone="UTC",
            attempt_deadline={"seconds": 3300},
        )

        # Check if jobs exist, create or update
        for job_name, job_obj in [("feature-materialization-run", job1), ("raw-ingest-run", job2)]:
            try:
                existing = client.get_job(request={"name": f"{parent}/jobs/{job_name}"})
                logger.info(f"✅ Job '{job_name}' already exists")
                # Could update here if needed
            except Exception:
                # Job doesn't exist, create it
                client.create_job(request={"parent": parent, "job": job_obj})
                logger.info(f"✅ Created Cloud Scheduler job: {job_name}")

        return True

    except Exception as e:
        logger.error(f"❌ Failed to setup Cloud Scheduler: {e}")
        return False


def setup_vercel_env(
    encryption_key: str,
    vercel_token: Optional[str] = None,
) -> bool:
    """Setup Vercel environment variable via Vercel API."""
    try:
        import requests
    except ImportError:
        logger.error("❌ requests not installed")
        logger.info("   Install with: pip install requests")
        return False

    if not vercel_token:
        vercel_token = os.environ.get("VERCEL_TOKEN")
        if not vercel_token:
            logger.warning("⚠️  No VERCEL_TOKEN provided, skipping Vercel setup")
            return False

    if not encryption_key or len(encryption_key) != 64:
        logger.error("❌ Invalid encryption_key (must be 64 hex characters)")
        return False

    try:
        headers = {
            "Authorization": f"Bearer {vercel_token}",
            "Content-Type": "application/json",
        }

        # Get list of projects to find the app project
        response = requests.get("https://api.vercel.com/v1/projects", headers=headers)
        response.raise_for_status()
        projects = response.json().get("projects", [])

        # Find project (assume first one or named "wtd-v2")
        project_id = None
        for proj in projects:
            if proj.get("name") == "wtd-v2" or proj.get("name") == "app":
                project_id = proj.get("id")
                break

        if not project_id:
            logger.error("❌ Could not find project in Vercel")
            return False

        logger.info(f"📝 Setting EXCHANGE_ENCRYPTION_KEY in project: {project_id}")

        # Set environment variable (production)
        url = f"https://api.vercel.com/v9/projects/{project_id}/env"
        payload = {
            "key": "EXCHANGE_ENCRYPTION_KEY",
            "value": encryption_key,
            "target": ["production"],
        }

        response = requests.post(url, headers=headers, json=payload)
        response.raise_for_status()

        logger.info("✅ Set EXCHANGE_ENCRYPTION_KEY in Vercel production")
        return True

    except Exception as e:
        logger.error(f"❌ Failed to setup Vercel env: {e}")
        return False


def verify_setup(project_id: str) -> bool:
    """Verify both setups are complete."""
    try:
        from google.cloud import scheduler_v1
    except ImportError:
        logger.warning("⚠️  google-cloud-scheduler not installed, skipping verification")
        return False

    try:
        client = scheduler_v1.CloudSchedulerClient()
        parent = client.common_project_path(project_id, "asia-southeast1")

        feature_job = None
        raw_job = None

        for job_name in ["feature-materialization-run", "raw-ingest-run"]:
            try:
                job = client.get_job(request={"name": f"{parent}/jobs/{job_name}"})
                if job_name == "feature-materialization-run":
                    feature_job = job
                else:
                    raw_job = job
                logger.info(f"✅ Verified job: {job_name}")
            except Exception:
                logger.error(f"❌ Job not found: {job_name}")

        return feature_job is not None and raw_job is not None

    except Exception as e:
        logger.error(f"❌ Verification failed: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(
        description="Setup infrastructure: Cloud Scheduler + Vercel Env",
    )
    parser.add_argument("--gcp-project", required=True, help="GCP Project ID")
    parser.add_argument("--scheduler-secret", help="SCHEDULER_SECRET from Cloud Run")
    parser.add_argument("--encryption-key", help="64-hex character encryption key")
    parser.add_argument("--vercel-token", help="Vercel API token (or use VERCEL_TOKEN env var)")
    parser.add_argument("--verify-only", action="store_true", help="Only verify, don't setup")

    args = parser.parse_args()

    if args.verify_only:
        logger.info("🔍 Verifying setup...")
        if verify_setup(args.gcp_project):
            logger.info("✅ All verified!")
            return 0
        else:
            logger.error("❌ Verification failed")
            return 1

    logger.info("🚀 Starting infrastructure setup...")

    # Setup Cloud Scheduler
    if args.scheduler_secret:
        logger.info("📝 Setting up Cloud Scheduler...")
        if not setup_gcp_scheduler(args.gcp_project, scheduler_secret=args.scheduler_secret):
            logger.warning("⚠️  Cloud Scheduler setup skipped or failed")
    else:
        logger.warning("⚠️  No scheduler_secret provided, skipping Cloud Scheduler")

    # Setup Vercel
    if args.encryption_key:
        logger.info("📝 Setting up Vercel environment...")
        if not setup_vercel_env(args.encryption_key, vercel_token=args.vercel_token):
            logger.warning("⚠️  Vercel setup skipped or failed")
    else:
        logger.warning("⚠️  No encryption_key provided, skipping Vercel")

    # Verify
    logger.info("🔍 Verifying setup...")
    if verify_setup(args.gcp_project):
        logger.info("✅ All setup complete!")
        return 0
    else:
        logger.warning("⚠️  Verification found issues, see above")
        return 1


if __name__ == "__main__":
    sys.exit(main())
