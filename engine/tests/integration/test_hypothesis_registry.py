"""W-0341: hypothesis_registry Supabase integration tests.

Runs only when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set.
Marks: pytest -m integration
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest

_HAS_SUPABASE = bool(
    os.environ.get("SUPABASE_URL", "").strip()
    and os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
)

pytestmark = pytest.mark.skipif(
    not _HAS_SUPABASE,
    reason="SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set",
)

TEST_SLUG_PREFIX = f"test-hyp-{uuid.uuid4().hex[:8]}"
TEST_FAMILY_A = f"family-a-{uuid.uuid4().hex[:6]}"
TEST_FAMILY_B = f"family-b-{uuid.uuid4().hex[:6]}"


@pytest.fixture(scope="module")
def store():
    from research.validation.hypothesis_registry_store import HypothesisRegistryStore
    return HypothesisRegistryStore()


@pytest.fixture(autouse=True, scope="module")
def cleanup(store):
    yield
    # Remove test rows by slug prefix pattern
    from supabase import create_client
    c = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    c.table("hypothesis_registry").delete().like("slug", f"{TEST_SLUG_PREFIX}%").execute()
    c.table("hypothesis_registry").delete().like("slug", f"test-hyp-%").execute()


class TestAC1_SlugDuplicateAllowed:
    """AC1: same slug registered twice → count = 2 (중복 허용)."""

    def test_double_register_counts_two(self, store):
        from supabase import create_client
        slug = f"{TEST_SLUG_PREFIX}-ac1"
        as_of = datetime.now(timezone.utc)

        id1 = store.register(slug=slug, family=TEST_FAMILY_A, overall_pass=True,
                              stage="shadow", as_of=as_of)
        id2 = store.register(slug=slug, family=TEST_FAMILY_A, overall_pass=False,
                              stage="shadow", as_of=as_of)

        assert id1 != id2

        c = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
        resp = (
            c.table("hypothesis_registry")
            .select("id", count="exact")
            .eq("slug", slug)
            .execute()
        )
        assert resp.count == 2, f"Expected 2 rows for slug={slug}, got {resp.count}"


class TestAC2_FamilyIsolation:
    """AC2: family 격리 — family_a 결과에 family_b slug 미포함."""

    def test_get_n_trials_isolated_by_family(self, store):
        slug_a = f"{TEST_SLUG_PREFIX}-ac2-fam-a"
        slug_b = f"{TEST_SLUG_PREFIX}-ac2-fam-b"
        as_of = datetime.now(timezone.utc)

        store.register(slug=slug_a, family=TEST_FAMILY_A, overall_pass=True,
                       stage="shadow", as_of=as_of)
        store.register(slug=slug_b, family=TEST_FAMILY_B, overall_pass=True,
                       stage="shadow", as_of=as_of)

        n_a = store.get_n_trials(TEST_FAMILY_A)
        n_b = store.get_n_trials(TEST_FAMILY_B)

        # family counts are independent
        assert n_a >= 1
        assert n_b >= 1

        # Cross-check via raw query
        from supabase import create_client
        c = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
        now = datetime.now(timezone.utc).isoformat()
        rows_a = (
            c.table("hypothesis_registry")
            .select("slug")
            .eq("family", TEST_FAMILY_A)
            .gt("expires_at", now)
            .execute()
            .data
        )
        slugs_a = {r["slug"] for r in rows_a}
        assert slug_b not in slugs_a, "family_b slug leaked into family_a results"


class TestAC3_ExpiredPurge:
    """AC3: 366일 이전 rows는 purge_expired()로 삭제됨."""

    def test_purge_expired_removes_old_rows(self, store):
        from supabase import create_client
        slug = f"{TEST_SLUG_PREFIX}-ac3-expired"
        # as_of 366일 전 → expires_at = as_of + 365d = 1일 전 (이미 만료)
        old_as_of = datetime.now(timezone.utc) - timedelta(days=366)

        c = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
        # Insert directly with past expires_at
        c.table("hypothesis_registry").insert({
            "slug": slug,
            "family": TEST_FAMILY_A,
            "overall_pass": False,
            "stage": "shadow",
            "computed_at": old_as_of.isoformat(),
            "expires_at": (old_as_of + timedelta(days=365)).isoformat(),
        }).execute()

        # Verify it's in DB
        before = c.table("hypothesis_registry").select("id").eq("slug", slug).execute()
        assert len(before.data) == 1, "Test row not inserted"

        deleted = store.purge_expired()
        assert deleted >= 1, f"purge_expired returned {deleted}, expected ≥1"

        after = c.table("hypothesis_registry").select("id").eq("slug", slug).execute()
        assert len(after.data) == 0, "Expired row was not purged"


class TestAC4_AsOfNoneRaisesValueError:
    """AC4: as_of=None → ValueError (lookahead bias 방지)."""

    def test_register_without_as_of_raises(self, store):
        with pytest.raises(ValueError, match="as_of"):
            store.register(
                slug="test-no-as-of",
                family="test-family",
                overall_pass=True,
                stage="shadow",
                as_of=None,
            )
