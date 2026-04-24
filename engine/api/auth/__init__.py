"""Authentication module for engine API.

Handles JWT validation, user context injection, audit logging.
"""

from .jwt_validator import JWTValidator, extract_user_id_from_jwt, is_protected_route

__all__ = ["JWTValidator", "extract_user_id_from_jwt", "is_protected_route"]
