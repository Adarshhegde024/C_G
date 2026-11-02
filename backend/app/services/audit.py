"""
CloudGuard Audit Logging Service
Records security and activity events to Supabase PostgreSQL audit_logs.
"""

from typing import Optional
import uuid
from datetime import datetime, timezone
from app.database import add_audit_log


def record_audit(
    user_id: str,
    event: str,
    description: Optional[str] = None,
    result: Optional[str] = "SUCCESS",
    ip_address: Optional[str] = None,
) -> None:
    """Inserts an immutable audit event for a user."""
    entry = {
        "id": str(uuid.uuid4()),
        "user_id": str(user_id),
        "event": event,
        "description": description,
        "result": result,
        "ip_address": ip_address,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    add_audit_log(entry)
