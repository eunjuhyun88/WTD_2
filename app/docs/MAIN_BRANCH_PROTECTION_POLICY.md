# Main Branch Protection Policy

## Target
- Branch: `main`
- Host: GitHub

## Required Settings

1. Pull request required before merge
- Require a pull request before merging: `ON`
- Required approvals: `1` (minimum), 권장 `2`
- Dismiss stale approvals when new commits are pushed: `ON`
- Require review from code owners: `ON` (CODEOWNERS 도입 시)

2. Required status checks
- Require status checks to pass before merging: `ON`
- Require branches to be up to date before merging: `ON`
- Required checks:
  - `CI / check`
  - `CI / build`

3. Direct push / force push control
- Restrict who can push to matching branches: `ON` (관리자/릴리즈봇만 예외)
- Allow force pushes: `OFF`
- Allow deletions: `OFF`

4. Admin + history safety
- Include administrators: `ON`
- Require linear history: `ON` (merge commit 정책을 유지하려면 `OFF`)
- Require conversation resolution before merging: `ON`

## Supporting CI
- Workflow file: `.github/workflows/ci-check-build.yml`
- Jobs:
  - `check` -> `npm ci && npm run check`
  - `build` -> `npm ci && npm run build`

## Optional Hardening
- Merge queue 사용 (대기열 직렬화)
- Signed commit required
- Secret scanning push protection
- Dependabot security updates auto-PR

## CLI Example (gh)
```bash
gh api \
  -X PUT \
  repos/eunjuhyun88/Stockclaw/branches/main/protection \
  -H "Accept: application/vnd.github+json" \
  -f required_pull_request_reviews.dismiss_stale_reviews=true \
  -f required_pull_request_reviews.required_approving_review_count=1 \
  -f required_status_checks.strict=true \
  -f enforce_admins=true \
  -f restrictions=null
```

Note:
- 실제 적용 시 `required_status_checks.contexts[]`에 `CI / check`, `CI / build`를 포함해야 한다.
