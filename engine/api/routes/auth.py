"""Auth routes — logout (token revocation).

POST /auth/logout
    Revokes the current JWT so it cannot be reused even before expiry.
    Requires a valid Bearer token in Authorization header.
"""
from __future__ import annotations

import json
import logging

import jwt as pyjwt
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from api.auth.token_blacklist import revoke_token

log = logging.getLogger(__name__)
router = APIRouter()


class LogoutResponse(BaseModel):
    ok: bool
    message: str


@router.post("/auth/logout", response_model=LogoutResponse, tags=["auth"])
async def logout(request: Request) -> LogoutResponse:
    """Revoke the caller's JWT.

    The token is added to the Redis blacklist with TTL = remaining validity.
    Subsequent requests with the same token will receive 403.

    Requires: Authorization: Bearer <token>
    """
    auth_header = request.headers.get("Authorization", "").strip()
    if not auth_header:
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    token = auth_header[7:] if auth_header.startswith("Bearer ") else auth_header

    # Decode without verification — we only need the claims for revocation.
    # The token was already verified by the JWT middleware before reaching here.
    try:
        payload = pyjwt.decode(token, options={"verify_signature": False})
    except pyjwt.exceptions.DecodeError as exc:
        raise HTTPException(status_code=401, detail="Invalid token format") from exc

    stored = await revoke_token(payload)

    if stored:
        log.info(json.dumps({
            "event": "auth.logout",
            "sub": payload.get("sub"),
            "jti": payload.get("jti"),
        }))
    else:
        log.warning(json.dumps({
            "event": "auth.logout_soft_fail",
            "sub": payload.get("sub"),
            "note": "Redis unavailable — token not revoked in blacklist",
        }))

    return LogoutResponse(ok=True, message="Logged out successfully")
