---
name: JWT Security P0 Implementation (2026-04-24)
description: JWT validation middleware + route migration (captures.py example) — blocking P0 for 1000-user scale
type: project
---

## Implementation Status: JWT Validation (P0-CRITICAL)

### ✅ COMPLETED (2026-04-24)

**Files Created:**
1. `engine/api/auth/jwt_validator.py` — JWT token validation logic
   - Decode JWT from Authorization header
   - Validate claims (exp, aud, iss)
   - Extract user_id from 'sub' claim
   - Return 401/403 on validation failure

2. `engine/api/auth/__init__.py` — Module exports

**Files Modified:**
1. `engine/api/main.py`
   - Import JWT validator + is_protected_route
   - Add jwt_auth_middleware after request_id_middleware
   - Inject request.state.user_id for protected routes

2. `engine/api/routes/captures.py` (EXAMPLE migration)
   - Remove user_id from CaptureCreateBody
   - Remove user_id from BulkImportBody
   - Create_capture: use request.state.user_id (inject via Request param)
   - Bulk_import_captures: use request.state.user_id

### 📋 REMAINING (Next Session)

**All other routes must follow captures.py pattern:**
- Challenge routes (`routes/challenge.py`)
- Score routes (`routes/score.py`)
- Chart routes (`routes/chart.py`)
- Context routes (`routes/ctx.py`)
- Facts routes (`routes/facts.py`)
- Search routes (`routes/search.py`)
- Runtime routes (`routes/runtime.py`)
- (All 23 public routes)

**Pattern to apply to each route file:**
```python
# 1. Import Request
from fastapi import APIRouter, Request

# 2. Remove user_id from RequestBody classes
# DELETE: user_id: str | None = None

# 3. Update route handlers
# OLD: async def my_route(body: MyBody) -> dict:
# NEW: async def my_route(request: Request, body: MyBody) -> dict:

# 4. Extract user_id from JWT
user_id = getattr(request.state, "user_id", None)
if not user_id:
    raise HTTPException(status_code=401, detail="User authentication required")

# 5. Use user_id in business logic (was body.user_id, now variable)
```

### 🔧 Configuration Required

**Environment variables (Vercel + Cloud Run):**
```bash
JWT_PUBLIC_KEY=<raw public key or path>
JWT_JWKS_URL=https://.../.well-known/jwks.json  # For production Vercel tokens
JWT_AUDIENCE=https://app.example.com           # Expected app origin
JWT_ISSUER=vercel                               # Expected token issuer
```

**Or: For testing / preview:**
```bash
JWT_PUBLIC_KEY=<test public key>
JWT_AUDIENCE=http://localhost:5173
JWT_ISSUER=local-dev
```

### 🧪 Testing Checklist

Before deployment:
- [ ] Create test JWT with valid signature/claims
- [ ] Test jwt_validator.validate() with valid token → returns user_id
- [ ] Test with expired token → raises HTTPException(403)
- [ ] Test with missing Authorization header on protected route → raises HTTPException(401)
- [ ] Test with invalid signature → raises HTTPException(401)
- [ ] Verify all 23 routes reject missing JWT
- [ ] Load test: 1000 concurrent requests with valid JWT → no auth latency spike

### 🔍 Audit Trail (Optional Next Step)

After JWT is working, add audit logging:
```sql
CREATE TABLE audit_log (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL,       -- "capture_create", "capture_read", etc.
    resource_id TEXT,
    timestamp TIMESTAMP DEFAULT NOW(),
    ip_address TEXT,
    status TEXT                 -- "success", "denied", "error"
);
```

Record on each protected route:
```python
log_audit(
    user_id=request.state.user_id,
    action=f"capture_create",
    resource_id=capture.capture_id,
    status="success"
)
```

### 🎯 Next Priority Order

1. **Migrate all 23 routes** (follow captures.py pattern) → 2-3 hours
2. **Verify JWT endpoint** (where are tokens issued?) → 30 min
3. **Load test JWT validation** (no latency regression) → 1 hour
4. **Add audit logging** (optional but recommended) → 1 hour
5. **Deploy to preview** (test with real Vercel tokens) → 1 hour

### 🚨 Security Notes

- **Current gap**: JWT_PUBLIC_KEY hardcoded in env → rotate monthly
- **Future**: Move to Google Secret Manager (KMS-wrapped)
- **Verify**: JWKS endpoint is HTTPS-only in production
- **Session**: JWT lifetime should be <= 1 hour (app refresh on expiry)
- **Middleware order**: JWT middleware runs AFTER request_id (for audit logging)

### 🔗 Related Work Items

- **W-0162** (New): JWT validation implementation (P0)
- **W-0124** (Deferred): GCP ingress auth hardening
- **W-0161** (Merged): App warning cleanup baseline
- **W-0148** (In Progress): CTO data engine reset (governance)
