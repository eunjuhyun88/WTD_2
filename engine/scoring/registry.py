"""Model version registry — Supabase model_versions table access layer.

Key operations:
  - register(version, training_size, gcs_path) → version_id
  - update_eval(version_id, ndcg, map, ci_lower)
  - promote(version_id)  — sets status='active', retires previous active
  - retire(version_id)
  - get_active(model_type) → ModelVersion | None
  - list_recent(model_type, limit) → list[ModelVersion]

Falls back to in-memory store if Supabase not configured (dev mode).
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional
import uuid

log = logging.getLogger("engine.scoring.registry")


@dataclass
class ModelVersion:
    id: str
    model_type: str
    version: str
    trained_at: datetime
    training_size: int
    ndcg_at_5: Optional[float]
    map_at_10: Optional[float]
    ci_lower: Optional[float]
    status: str  # shadow | active | retired
    gcs_path: Optional[str]


def _row_to_model_version(row: dict) -> ModelVersion:
    trained_at = row["trained_at"]
    if isinstance(trained_at, str):
        # Parse ISO 8601 from Supabase
        trained_at = datetime.fromisoformat(trained_at.replace("Z", "+00:00"))
    elif not isinstance(trained_at, datetime):
        trained_at = datetime.now(tz=timezone.utc)
    return ModelVersion(
        id=row["id"],
        model_type=row["model_type"],
        version=row["version"],
        trained_at=trained_at,
        training_size=row["training_size"],
        ndcg_at_5=row.get("ndcg_at_5"),
        map_at_10=row.get("map_at_10"),
        ci_lower=row.get("ci_lower"),
        status=row["status"],
        gcs_path=row.get("gcs_path"),
    )


class ModelRegistry:
    """Thin wrapper around Supabase model_versions table.

    Falls back to in-memory store if Supabase not configured (dev mode).
    """

    def __init__(self) -> None:
        self._supabase_url = os.environ.get("SUPABASE_URL")
        self._supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        self._use_supabase = bool(self._supabase_url and self._supabase_key)
        self._mem: dict[str, ModelVersion] = {}  # fallback: id → ModelVersion

    def _client(self):  # type: ignore[return]
        """Return a Supabase client (lazy import)."""
        from supabase import create_client  # type: ignore
        return create_client(self._supabase_url, self._supabase_key)  # type: ignore

    # ─── public API ───────────────────────────────────────────────────────────

    def register(
        self,
        *,
        model_type: str = "search_layer_c",
        version: str,
        training_size: int,
        gcs_path: Optional[str] = None,
    ) -> str:
        """Register a new model version (status='shadow'). Returns the version_id."""
        version_id = str(uuid.uuid4())
        now = datetime.now(tz=timezone.utc)

        if self._use_supabase:
            try:
                row = {
                    "id": version_id,
                    "model_type": model_type,
                    "version": version,
                    "trained_at": now.isoformat(),
                    "training_size": training_size,
                    "status": "shadow",
                    "gcs_path": gcs_path,
                }
                self._client().table("model_versions").insert(row).execute()
                log.info("Registered model version %s (%s/%s) in Supabase", version_id, model_type, version)
                return version_id
            except Exception:
                log.exception("Supabase register failed, falling back to in-memory")

        # in-memory fallback
        mv = ModelVersion(
            id=version_id,
            model_type=model_type,
            version=version,
            trained_at=now,
            training_size=training_size,
            ndcg_at_5=None,
            map_at_10=None,
            ci_lower=None,
            status="shadow",
            gcs_path=gcs_path,
        )
        self._mem[version_id] = mv
        log.debug("Registered model version %s in-memory", version_id)
        return version_id

    def update_eval(
        self,
        version_id: str,
        *,
        ndcg_at_5: float,
        map_at_10: float,
        ci_lower: float,
    ) -> None:
        """Update evaluation metrics for a registered model version."""
        if self._use_supabase:
            try:
                self._client().table("model_versions").update(
                    {"ndcg_at_5": ndcg_at_5, "map_at_10": map_at_10, "ci_lower": ci_lower}
                ).eq("id", version_id).execute()
                log.info("Updated eval for version_id=%s", version_id)
                return
            except Exception:
                log.exception("Supabase update_eval failed, falling back to in-memory")

        if version_id in self._mem:
            mv = self._mem[version_id]
            self._mem[version_id] = ModelVersion(
                id=mv.id,
                model_type=mv.model_type,
                version=mv.version,
                trained_at=mv.trained_at,
                training_size=mv.training_size,
                ndcg_at_5=ndcg_at_5,
                map_at_10=map_at_10,
                ci_lower=ci_lower,
                status=mv.status,
                gcs_path=mv.gcs_path,
            )

    def promote(self, version_id: str) -> None:
        """Promote to active, retire previous active model of the same model_type."""
        if self._use_supabase:
            try:
                client = self._client()
                # Get the target version to find model_type
                resp = client.table("model_versions").select("model_type").eq("id", version_id).single().execute()
                model_type = resp.data["model_type"]
                # Retire all current active versions for this model_type
                client.table("model_versions").update({"status": "retired"}).eq(
                    "model_type", model_type
                ).eq("status", "active").execute()
                # Promote the target
                client.table("model_versions").update({"status": "active"}).eq("id", version_id).execute()
                log.info("Promoted version_id=%s to active", version_id)
                return
            except Exception:
                log.exception("Supabase promote failed, falling back to in-memory")

        # in-memory fallback
        if version_id not in self._mem:
            log.warning("promote: version_id=%s not found in registry", version_id)
            return
        target = self._mem[version_id]
        # Retire any current active for same model_type
        for vid, mv in list(self._mem.items()):
            if mv.model_type == target.model_type and mv.status == "active":
                self._mem[vid] = ModelVersion(
                    id=mv.id, model_type=mv.model_type, version=mv.version,
                    trained_at=mv.trained_at, training_size=mv.training_size,
                    ndcg_at_5=mv.ndcg_at_5, map_at_10=mv.map_at_10,
                    ci_lower=mv.ci_lower, status="retired", gcs_path=mv.gcs_path,
                )
        # Promote target
        self._mem[version_id] = ModelVersion(
            id=target.id, model_type=target.model_type, version=target.version,
            trained_at=target.trained_at, training_size=target.training_size,
            ndcg_at_5=target.ndcg_at_5, map_at_10=target.map_at_10,
            ci_lower=target.ci_lower, status="active", gcs_path=target.gcs_path,
        )
        log.debug("Promoted version_id=%s to active (in-memory)", version_id)

    def retire(self, version_id: str) -> None:
        """Retire a model version (sets status='retired')."""
        if self._use_supabase:
            try:
                self._client().table("model_versions").update({"status": "retired"}).eq(
                    "id", version_id
                ).execute()
                log.info("Retired version_id=%s", version_id)
                return
            except Exception:
                log.exception("Supabase retire failed, falling back to in-memory")

        if version_id in self._mem:
            mv = self._mem[version_id]
            self._mem[version_id] = ModelVersion(
                id=mv.id, model_type=mv.model_type, version=mv.version,
                trained_at=mv.trained_at, training_size=mv.training_size,
                ndcg_at_5=mv.ndcg_at_5, map_at_10=mv.map_at_10,
                ci_lower=mv.ci_lower, status="retired", gcs_path=mv.gcs_path,
            )

    def get_active(self, model_type: str = "search_layer_c") -> Optional[ModelVersion]:
        """Return the currently active model for model_type, or None."""
        if self._use_supabase:
            try:
                resp = (
                    self._client()
                    .table("model_versions")
                    .select("*")
                    .eq("model_type", model_type)
                    .eq("status", "active")
                    .limit(1)
                    .execute()
                )
                if resp.data:
                    return _row_to_model_version(resp.data[0])
                return None
            except Exception:
                log.exception("Supabase get_active failed, falling back to in-memory")

        for mv in self._mem.values():
            if mv.model_type == model_type and mv.status == "active":
                return mv
        return None

    def list_recent(
        self, model_type: str = "search_layer_c", limit: int = 10
    ) -> list[ModelVersion]:
        """Return most recent model versions (by trained_at desc)."""
        if self._use_supabase:
            try:
                resp = (
                    self._client()
                    .table("model_versions")
                    .select("*")
                    .eq("model_type", model_type)
                    .order("trained_at", desc=True)
                    .limit(limit)
                    .execute()
                )
                return [_row_to_model_version(row) for row in resp.data]
            except Exception:
                log.exception("Supabase list_recent failed, falling back to in-memory")

        versions = [mv for mv in self._mem.values() if mv.model_type == model_type]
        versions.sort(key=lambda mv: mv.trained_at, reverse=True)
        return versions[:limit]

    def get_next_version(self, model_type: str = "search_layer_c") -> str:
        """Returns 'v1', 'v2', ... based on existing versions."""
        recent = self.list_recent(model_type, limit=100)
        if not recent:
            return "v1"
        # Parse the numeric suffix from version strings like 'v1', 'v12'
        max_n = 0
        for mv in recent:
            if mv.version.startswith("v"):
                try:
                    n = int(mv.version[1:])
                    max_n = max(max_n, n)
                except ValueError:
                    pass
        return f"v{max_n + 1}"
