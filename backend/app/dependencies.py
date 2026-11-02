"""
CloudGuard Authentication & RBAC Dependencies
Validates JWT Bearer tokens and extracts the authenticated user profile.
Never trusts a user ID supplied in the request body.
"""

from typing import List, Optional
import jwt
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.config import JWT_SECRET, JWT_ALGORITHM
from app.database import get_profile_by_id, get_profile_by_email
from app.models.schemas import AuthUser, Role

security = HTTPBearer(auto_error=False)


def create_access_token(data: dict) -> str:
    """Create signed JWT token."""
    to_encode = data.copy()
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return encoded_jwt


def decode_access_token(token: str) -> Optional[dict]:
    """Decode and verify JWT token."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except Exception:
        return None


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security)
) -> AuthUser:
    """
    Validates the bearer token and loads the verified profile from Supabase PostgreSQL.
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please sign in.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Your session has expired. Please sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    profile_id = payload.get("sub") or payload.get("id")
    email = payload.get("email")

    if not profile_id and not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid session token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Fetch profile from Supabase PostgreSQL
    profile = None
    if profile_id:
        profile = get_profile_by_id(profile_id)
    if not profile and email:
        profile = get_profile_by_email(email)

    if not profile:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account not found or session revoked.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return AuthUser(
        id=str(profile["id"]),
        name=profile.get("full_name") or profile.get("name") or "User",
        email=profile["email"],
        role=profile.get("role", "owner"),
        account_status=profile.get("account_status", "ACTIVE"),
        avatar_url=profile.get("avatar_url"),
    )


def require_role(allowed_roles: List[Role]):
    """Enforces role-based access control (RBAC)."""
    async def role_checker(current_user: AuthUser = Depends(get_current_user)) -> AuthUser:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required role: {', '.join(allowed_roles)}.",
            )
        return current_user

    return role_checker
