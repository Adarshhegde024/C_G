"""
CloudGuard Notifications API Router
Fetches and updates in-app user notifications.
"""

from typing import List
from datetime import datetime, timezone
from fastapi import APIRouter, Depends

from app.dependencies import get_current_user
from app.models.schemas import AuthUser, AppNotification
from app.database import get_supabase, get_notifications

router = APIRouter(prefix="/api/notifications", tags=["Notifications"])


@router.get("", response_model=List[AppNotification])
async def list_notifications(current_user: AuthUser = Depends(get_current_user)):
    """Returns in-app notifications for current user."""
    raw = get_notifications(current_user.id)
    if not raw:
        # Default system greeting notification if none exist
        return [
            AppNotification(
                id="welcome-1",
                title="Vault Active",
                body="Your CloudGuard secure vault is active and encrypted.",
                created_at=datetime.now(timezone.utc).isoformat(),
                read=False,
            )
        ]
    return [
        AppNotification(
            id=str(n["id"]),
            title=n["title"],
            body=n.get("body"),
            created_at=n.get("created_at", datetime.now(timezone.utc).isoformat()),
            read=n.get("read", False),
        )
        for n in raw
    ]


@router.post("/read")
async def mark_read(current_user: AuthUser = Depends(get_current_user)):
    """Marks all user notifications as read."""
    supabase = get_supabase()
    try:
        supabase.table("notifications").update({"read": True}).eq("user_id", current_user.id).execute()
    except Exception:
        pass
    return {"ok": True}
